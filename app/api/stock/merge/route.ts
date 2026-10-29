import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createServiceClient } from '@/lib/supabase/service'

type Kind = 'tire' | 'product'

// Fields copied from the duplicate when the kept record has them empty (keeps the prices etc.)
const FILL: Record<Kind, string[]> = {
  tire:    ['brand', 'width', 'profile', 'rim', 'load_idx', 'speed_idx', 'cost_price', 'sell_price', 'sku', 'location', 'notes', 'supplier_id'],
  product: ['sku', 'barcode', 'category', 'buy_price', 'sell_price', 'supplier_id', 'notes'],
}
const empty = (v: unknown) => v === null || v === undefined || v === '' || v === 0

// POST /api/stock/merge  { kind: 'tire'|'product', target_id, source_ids: string[] }
// Moves stock, movements and references from each source into the target, fills the target's
// missing fields from the sources, then deletes the sources.
export async function POST(req: NextRequest) {
  const body = await req.json() as { kind: Kind; target_id: string; source_ids: string[] }
  const { kind, target_id } = body
  const source_ids = (body.source_ids ?? []).filter(id => id && id !== target_id)
  if ((kind !== 'tire' && kind !== 'product') || !target_id || !source_ids.length) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }

  const auth = await requireAuth(kind === 'tire' ? ['tires'] : ['products'])
  if ('error' in auth) return auth.error
  const tenantId = auth.profile.tenant_id

  const sb  = createServiceClient()
  const tbl = kind === 'tire' ? 'tires' : 'products'

  const { data: rows, error: readErr } = await sb.from(tbl).select('*')
    .eq('tenant_id', tenantId).in('id', [target_id, ...source_ids])
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const target  = rows?.find(r => r.id === target_id)
  const sources = (rows ?? []).filter(r => r.id !== target_id)
  if (!target || sources.length !== source_ids.length) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  // References first — tire_sales / product_sales cascade-delete with the source otherwise
  const moves = kind === 'tire'
    ? [
        sb.from('tire_sales').update({ tire_id: target_id }).in('tire_id', source_ids),
        sb.from('tire_inventory_count_entries').update({ tire_id: target_id }).in('tire_id', source_ids),
        sb.from('tire_loans').update({ tire_id: target_id }).in('tire_id', source_ids),
        sb.from('yard_session_items').update({ ref_id: target_id }).eq('item_type', 'tire').in('ref_id', source_ids),
      ]
    : [
        sb.from('product_sales').update({ product_id: target_id }).in('product_id', source_ids),
        sb.from('yard_session_items').update({ ref_id: target_id }).eq('item_type', 'product').in('ref_id', source_ids),
      ]
  const moved = await Promise.all(moves)
  const moveErr = moved.find(r => r.error)?.error
  if (moveErr) {
    console.error('[stock/merge] move refs', moveErr.message)
    return NextResponse.json({ error: 'שגיאה בהעברת התנועות — לא נמחק דבר' }, { status: 500 })
  }

  const patch: Record<string, unknown> = {
    qty: (target.qty ?? 0) + sources.reduce((s, r) => s + (r.qty ?? 0), 0),
  }
  for (const f of FILL[kind]) {
    if (!empty(target[f])) continue
    const from = sources.find(r => !empty(r[f]))
    if (from) patch[f] = from[f]
  }
  const { error: upErr } = await sb.from(tbl).update(patch).eq('id', target_id).eq('tenant_id', tenantId)
  if (upErr) {
    console.error('[stock/merge] update target', upErr.message)
    return NextResponse.json({ error: 'שגיאה בעדכון הרשומה — לא נמחק דבר' }, { status: 500 })
  }

  const { error: delErr } = await sb.from(tbl).delete().eq('tenant_id', tenantId).in('id', source_ids)
  if (delErr) {
    console.error('[stock/merge] delete sources', delErr.message)
    return NextResponse.json({ error: 'המלאי הועבר, אך מחיקת הכפילויות נכשלה — מחק ידנית' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, merged: source_ids.length })
}
