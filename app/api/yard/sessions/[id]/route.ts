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

    // Deduct inventory for all items with ref_id, and record per item how many units were
    // sold beyond what was in stock (no_stock_qty) — the office sorts those out later in
    // "מעקב רחבה → נמכר ללא מלאי". Items with no ref_id (charged freely) are all "no stock".
    const { data: session } = await supabase
      .from('yard_sessions')
      .select('yard_session_items(id, item_type, ref_id, quantity)')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    type Item = { id: string; item_type: string; ref_id: string | null; quantity: number }
    const items = ((session?.yard_session_items ?? []) as Item[]).filter(i => i.item_type === 'tire' || i.item_type === 'product')
    const tireIds = [...new Set(items.filter(i => i.item_type === 'tire' && i.ref_id).map(i => i.ref_id!))]
    const prodIds = [...new Set(items.filter(i => i.item_type === 'product' && i.ref_id).map(i => i.ref_id!))]
    const [tq, pq] = await Promise.all([
      tireIds.length ? supabase.from('tires').select('id, qty').in('id', tireIds) : Promise.resolve({ data: [] as { id: string; qty: number }[] }),
      prodIds.length ? supabase.from('products').select('id, qty').in('id', prodIds) : Promise.resolve({ data: [] as { id: string; qty: number }[] }),
    ])
    const left = new Map<string, number>()
    for (const r of [...(tq.data ?? []), ...(pq.data ?? [])]) left.set(r.id, Math.max(0, Number(r.qty) || 0))

    for (const item of items) {
      let short = item.quantity
      if (item.ref_id) {
        const have = left.get(item.ref_id) ?? 0
        short = Math.max(0, item.quantity - have)
        left.set(item.ref_id, Math.max(0, have - item.quantity))
        const fn = item.item_type === 'tire' ? 'decrement_tire_qty' : 'decrement_product_qty'
        const { error: decErr } = await supabase.rpc(fn, { p_id: item.ref_id, p_qty: item.quantity })
        if (decErr) console.error(`${fn} failed`, item.ref_id, decErr.message)
        // Record the sale as a stock movement (shown on the stock screen next to arrivals)
        const [table, refCol] = item.item_type === 'tire' ? ['tire_sales', 'tire_id'] : ['product_sales', 'product_id']
        const row = { tenant_id: profile.tenant_id, [refCol]: item.ref_id, qty: item.quantity, movement_type: 'sale' }
        let { error: mvErr } = await supabase.from(table).insert({ ...row, source: 'yard', session_id: id })
        // Before migration 109 the source columns don't exist yet — still record the sale
        if (mvErr && /source|session_id|column/i.test(mvErr.message)) ({ error: mvErr } = await supabase.from(table).insert(row))
        if (mvErr) console.error('sale movement insert failed', item.ref_id, mvErr.message)
      }
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
