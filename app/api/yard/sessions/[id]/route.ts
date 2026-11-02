import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/sessions/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('yard_sessions')
    .select(`
      *,
      yard_session_items(*, created_at)
    `)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/yard/sessions/[id] — change status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id } = await params

  const body = await req.json()
  const { status, make, model, year } = body
  const closeType: 'charged' | 'free' | 'cancelled' = ['free', 'cancelled'].includes(body.close_type) ? body.close_type : 'charged'

  const supabase = createServiceClient()

  // Vehicle info patch (background plate-lookup resolution)
  if (status === undefined && (make !== undefined || model !== undefined || year !== undefined)) {
    const vehicleUpdate: Record<string, unknown> = {}
    if (make  !== undefined) vehicleUpdate.make  = make
    if (model !== undefined) vehicleUpdate.model = model
    if (year  !== undefined) vehicleUpdate.year  = year
    const { data, error } = await supabase
      .from('yard_sessions')
      .update(vehicleUpdate)
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const allowed = ['active', 'pending_office', 'archived']
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }

  // close_type arrives with migration 114 — fall back to status alone before it runs
  let { data: current } = await supabase.from('yard_sessions').select('status, close_type')
    .eq('id', id).eq('tenant_id', profile.tenant_id).single() as { data: { status: string; close_type?: string | null } | null }
  if (!current) ({ data: current } = await supabase.from('yard_sessions').select('status')
    .eq('id', id).eq('tenant_id', profile.tenant_id).single())
  // Already closed — closing again must not deduct the stock a second time
  if (status === 'archived' && current?.status === 'archived') {
    const { data } = await supabase.from('yard_sessions').select().eq('id', id).eq('tenant_id', profile.tenant_id).single()
    return NextResponse.json(data)
  }

  // Reopening a closed card: put back the stock the close deducted (decrement stops at 0, so
  // only quantity − no_stock_qty actually left the shelf) and remove its sale movements.
  // A cancelled card deducted nothing, so there is nothing to put back.
  if (current?.status === 'archived' && status !== 'archived') {
    update.closed_at = null
    if ('close_type' in current) update.close_type = null
  }
  if (current?.status === 'archived' && status !== 'archived' && current.close_type !== 'cancelled') {
    const { data: session } = await supabase
      .from('yard_sessions')
      .select('yard_session_items(id, item_type, ref_id, quantity, no_stock_qty)')
      .eq('id', id).eq('tenant_id', profile.tenant_id).single()
    type RItem = { id: string; item_type: string; ref_id: string | null; quantity: number; no_stock_qty: number | null }
    const items = ((session?.yard_session_items ?? []) as RItem[]).filter(i => i.ref_id && (i.item_type === 'tire' || i.item_type === 'product'))
    for (const item of items) {
      const back = Math.max(0, item.quantity - (item.no_stock_qty ?? 0))
      if (back > 0) {
        const table = item.item_type === 'tire' ? 'tires' : 'products'
        const { data: row } = await supabase.from(table).select('qty').eq('id', item.ref_id!).eq('tenant_id', profile.tenant_id).single()
        if (row) {
          const { error: incErr } = await supabase.from(table).update({ qty: (Number(row.qty) || 0) + back }).eq('id', item.ref_id!)
          if (incErr) console.error('restore qty failed', item.ref_id, incErr.message)
        }
      }
      await supabase.from('yard_session_items').update({ no_stock_qty: null }).eq('id', item.id)
    }
    for (const table of ['tire_sales', 'product_sales']) {
      const { error: delErr } = await supabase.from(table).delete().eq('tenant_id', profile.tenant_id).eq('session_id', id)
      if (delErr && !/session_id|column/i.test(delErr.message)) console.error('remove sale movements failed', table, delErr.message)
    }
  }

  if (status === 'archived') {
    update.closed_at = new Date().toISOString()
    update.closed_by = null
    const hasCol = current != null && 'close_type' in current
    if (hasCol) update.close_type = closeType
    else if (closeType !== 'charged')
      return NextResponse.json({ error: 'סגירה ללא חיוב / ביטול דורשים הרצת מיגרציה 114' }, { status: 400 })
  }
  // Cancelled: close without touching stock and without recording sales
  if (status === 'archived' && closeType !== 'cancelled') {

    // Deduct inventory for every item linked to a tire/product — the full quantity, even below
    // zero (a tire installed before it was received shows as e.g. −2 until the receive puts it
    // right). Items with no ref_id (charged freely / unknown barcode) are "no stock": the office
    // links them to a tire in "נמכר ללא מלאי".
    const { data: session } = await supabase
      .from('yard_sessions')
      .select('yard_session_items(id, item_type, ref_id, quantity)')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    type Item = { id: string; item_type: string; ref_id: string | null; quantity: number }
    const items = ((session?.yard_session_items ?? []) as Item[]).filter(i => i.item_type === 'tire' || i.item_type === 'product')
    for (const item of items) {
      if (item.ref_id) {
        const table = item.item_type === 'tire' ? 'tires' : 'products'
        const { data: row } = await supabase.from(table).select('qty').eq('id', item.ref_id).eq('tenant_id', profile.tenant_id).maybeSingle()
        if (row) {
          const { error: decErr } = await supabase.from(table).update({ qty: (Number(row.qty) || 0) - item.quantity })
            .eq('id', item.ref_id).eq('tenant_id', profile.tenant_id)
          if (decErr) console.error('stock decrement failed', item.ref_id, decErr.message)
        }
        // Record the sale as a stock movement (shown on the stock screen next to arrivals)
        const [mvTable, refCol] = item.item_type === 'tire' ? ['tire_sales', 'tire_id'] : ['product_sales', 'product_id']
        const mv = { tenant_id: profile.tenant_id, [refCol]: item.ref_id, qty: item.quantity, movement_type: 'sale' }
        let { error: mvErr } = await supabase.from(mvTable).insert({ ...mv, source: 'yard', session_id: id })
        // Before migration 109 the source columns don't exist yet — still record the sale
        if (mvErr && /source|session_id|column/i.test(mvErr.message)) ({ error: mvErr } = await supabase.from(mvTable).insert(mv))
        if (mvErr) console.error('sale movement insert failed', item.ref_id, mvErr.message)
      }
      const short = item.ref_id ? 0 : item.quantity
      const { error: nsErr } = await supabase.from('yard_session_items')
        .update({ no_stock_qty: short > 0 ? short : null }).eq('id', item.id)
      if (nsErr) console.error('no_stock_qty update failed', item.id, nsErr.message)
    }
  }

  const { data, error } = await supabase
    .from('yard_sessions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
