import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/no-stock?status=open|all — items sold without (enough) stock on closed cards
// PATCH /api/yard/no-stock { ids: string[], resolved: boolean } — mark "✓ סודר" / undo
export async function GET(req: NextRequest) {
  const auth = await requireYard('yard_reports')
  if ('error' in auth) return auth.error
  const all = req.nextUrl.searchParams.get('status') === 'all'
  let q = createServiceClient().from('yard_session_items')
    .select('id, item_type, ref_id, name, sku, quantity, unit_price, no_stock_qty, stock_resolved_at, created_at, yard_sessions!inner(plate, closed_at, status)')
    .eq('tenant_id', auth.user.tenantId)
    .gt('no_stock_qty', 0)
    .eq('yard_sessions.status', 'archived')
  if (!all) q = q.is('stock_resolved_at', null)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireYard('yard_reports')
  if ('error' in auth) return auth.error
  const { ids, resolved } = await req.json() as { ids?: string[]; resolved?: boolean }
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 })
  const { error } = await createServiceClient().from('yard_session_items')
    .update({ stock_resolved_at: resolved === false ? null : new Date().toISOString() })
    .in('id', ids).eq('tenant_id', auth.user.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

type Sb = ReturnType<typeof createServiceClient>

// Take `qty` units of a tire/product out of stock (may go below zero) + log the sale movement
async function deduct(sb: Sb, tenantId: string, type: 'tire' | 'product', refId: string, qty: number, sessionId: string | null) {
  const table = type === 'tire' ? 'tires' : 'products'
  const { data: row } = await sb.from(table).select('qty').eq('id', refId).eq('tenant_id', tenantId).maybeSingle()
  if (!row) return 'הפריט לא נמצא במלאי'
  const { error } = await sb.from(table).update({ qty: (Number(row.qty) || 0) - qty }).eq('id', refId).eq('tenant_id', tenantId)
  if (error) return error.message
  const [mvTable, refCol] = type === 'tire' ? ['tire_sales', 'tire_id'] : ['product_sales', 'product_id']
  const { error: mvErr } = await sb.from(mvTable).insert({ tenant_id: tenantId, [refCol]: refId, qty, movement_type: 'sale', source: 'yard', session_id: sessionId })
  if (mvErr) console.error('[no-stock] movement', mvErr.message)
  return null
}

// POST /api/yard/no-stock
//  { action: 'link', id, ref_id }          — a freely-charged line was really this tire/product
//  { action: 'create', id, tire: {...} }   — …or a tire that isn't in the system yet: create it
//  { action: 'apply_linked' }              — one-off: lines from before negative stock that ARE
//     linked but whose missing units never left the stock (it stopped at 0) — take them out now
export async function POST(req: NextRequest) {
  const auth = await requireYard('yard_reports')
  if ('error' in auth) return auth.error
  const tenantId = auth.user.tenantId
  const sb = createServiceClient()
  const body = await req.json() as {
    action: 'link' | 'create' | 'apply_linked'; id?: string; ref_id?: string
    tire?: { brand?: string; width?: number; profile?: number; rim?: number; sell_price?: number }
  }
  const now = new Date().toISOString()

  if (body.action === 'apply_linked') {
    const { data, error } = await sb.from('yard_session_items')
      .select('id, item_type, ref_id, no_stock_qty, session_id')
      .eq('tenant_id', tenantId).gt('no_stock_qty', 0).is('stock_resolved_at', null).not('ref_id', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    let done = 0
    for (const r of data ?? []) {
      const err = await deduct(sb, tenantId, r.item_type, r.ref_id!, r.no_stock_qty, null)
      if (err) continue
      // the whole quantity has now left the stock → nothing "missing" anymore (reopen puts it all back)
      await sb.from('yard_session_items').update({ no_stock_qty: null, stock_resolved_at: now }).eq('id', r.id)
      done++
    }
    return NextResponse.json({ done })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: item } = await sb.from('yard_session_items')
    .select('id, item_type, ref_id, sku, quantity, unit_price, session_id')
    .eq('id', body.id).eq('tenant_id', tenantId).maybeSingle()
  if (!item) return NextResponse.json({ error: 'השורה לא נמצאה' }, { status: 404 })
  if (item.ref_id) return NextResponse.json({ error: 'השורה כבר מקושרת לפריט במלאי' }, { status: 400 })
  const type = item.item_type as 'tire' | 'product'
  const code = (item.sku ?? '').trim()

  let refId = body.ref_id ?? null
  if (body.action === 'create') {
    if (type !== 'tire' || !body.tire) return NextResponse.json({ error: 'tire required' }, { status: 400 })
    const t = body.tire
    const { data: created, error } = await sb.from('tires').insert({
      tenant_id: tenantId, qty: 0, brand: t.brand?.trim() || null,
      width: t.width || null, profile: t.profile || null, rim: t.rim || null,
      sell_price: t.sell_price ?? (Number(item.unit_price) || null), sku: code || null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    refId = created.id
  } else if (body.action === 'link' && refId && code) {
    // The scanned (unknown) barcode belongs to this item → keep it so the next scan finds it
    const table = type === 'tire' ? 'tires' : 'products'
    const { data: cur } = await sb.from(table).select('*').eq('id', refId).eq('tenant_id', tenantId).maybeSingle()
    const alts: string[] = Array.isArray(cur?.alt_barcodes) ? cur.alt_barcodes : []
    if (cur && code !== cur.sku && code !== cur.barcode && !alts.includes(code))
      await sb.from(table).update({ alt_barcodes: [...alts, code] }).eq('id', refId).eq('tenant_id', tenantId)
  }
  if (!refId) return NextResponse.json({ error: 'ref_id required' }, { status: 400 })

  const err = await deduct(sb, tenantId, type, refId, item.quantity, item.session_id)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  const { error: upErr } = await sb.from('yard_session_items')
    .update({ ref_id: refId, no_stock_qty: null, stock_resolved_at: now }).eq('id', item.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
