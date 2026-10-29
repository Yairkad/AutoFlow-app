import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeSearch } from '@/lib/search/fuzzy'
import { brandMap, sameBrand, type BrandMap } from '@/lib/tires/brands'

type Sb = ReturnType<typeof createServiceClient>

export interface ArrivalInput {
  item_type: 'tire' | 'product'
  ref_id?: string | null        // picked from the list; otherwise matched / created by the fields below
  description: string
  brand?: string | null         // tire
  width?: number | null
  profile?: number | null
  rim?: number | null
  name?: string | null          // product
  qty: number
  unit_cost?: number | null
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  normalizeSearch(a ?? '').replace(/\s+/g, '') === normalizeSearch(b ?? '').replace(/\s+/g, '')

// Existing item for a typed line (same brand+size / same product name), or a new one
async function resolveItem(sb: Sb, tenantId: string, supplierId: string | null, it: ArrivalInput, brands: BrandMap): Promise<string | null> {
  if (it.ref_id) return it.ref_id
  if (it.item_type === 'tire') {
    if (it.width && it.profile && it.rim) {
      const { data } = await sb.from('tires').select('id, brand, sell_price, qty')
        .eq('tenant_id', tenantId).eq('width', it.width).eq('profile', it.profile).eq('rim', it.rim)
      const hit = (data ?? []).filter(t => sameBrand(brands, t.brand, it.brand))
        .sort((a, b) => Number((b.sell_price ?? 0) > 0) - Number((a.sell_price ?? 0) > 0) || (b.qty ?? 0) - (a.qty ?? 0))[0]
      if (hit) return hit.id
    }
    // A brand typed in Hebrew is saved under its English name when one is set (מישלן → Michelin)
    const typed = it.brand?.trim() || null
    const english = typed ? [...brands.entries()].find(([, he]) => same(he, typed))?.[0] : undefined
    const { data: known } = english ? await sb.from('tire_brands').select('name_en').eq('tenant_id', tenantId) : { data: null }
    const brand = (english && known?.find(k => same(k.name_en, english))?.name_en) || typed
    const { data, error } = await sb.from('tires').insert({
      tenant_id: tenantId, brand, width: it.width || null, profile: it.profile || null,
      rim: it.rim || null, qty: 0, supplier_id: supplierId,
    }).select('id').single()
    if (error) { console.error('[invoice-items] new tire', error.message); return null }
    return data.id
  }
  const name = (it.name || it.description).trim()
  const { data } = await sb.from('products').select('id, name').eq('tenant_id', tenantId)
  const hit = (data ?? []).find(p => same(p.name, name))
  if (hit) return hit.id
  const { data: created, error } = await sb.from('products')
    .insert({ tenant_id: tenantId, name, qty: 0, supplier_id: supplierId }).select('id').single()
  if (error) { console.error('[invoice-items] new product', error.message); return null }
  return created.id
}

// POST /api/stock/invoice-items  { debt_id, items: ArrivalInput[] }
// Adds the stock for each line, sets the cost price from the invoice (the invoice price wins),
// logs an incoming movement and stores the line on the invoice.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['suppliers'])
  if ('error' in auth) return auth.error
  const tenantId = auth.profile.tenant_id

  const { debt_id, items } = await req.json() as { debt_id: string; items: ArrivalInput[] }
  const lines = (items ?? []).filter(i => (i.item_type === 'tire' || i.item_type === 'product') && i.qty > 0)
  if (!debt_id || !lines.length) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const sb = createServiceClient()
  const { data: debt } = await sb.from('supplier_debts').select('id, supplier_id, date')
    .eq('id', debt_id).eq('tenant_id', tenantId).maybeSingle()
  if (!debt) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const { data: brandRows } = await sb.from('tire_brands').select('name_en, name_he').eq('tenant_id', tenantId)
  const brands = brandMap(brandRows)

  let failed = 0
  for (const it of lines) {
    const refId = await resolveItem(sb, tenantId, debt.supplier_id, it, brands)
    if (!refId) { failed++; continue }
    const tbl = it.item_type === 'tire' ? 'tires' : 'products'
    const { data: cur } = await sb.from(tbl).select('qty, supplier_id').eq('id', refId).eq('tenant_id', tenantId).maybeSingle()
    if (!cur) { failed++; continue }

    const cost = it.unit_cost && it.unit_cost > 0 ? it.unit_cost : null
    const { error: upErr } = await sb.from(tbl).update({
      qty: (cur.qty ?? 0) + it.qty,
      ...(cost ? (it.item_type === 'tire' ? { cost_price: cost } : { buy_price: cost }) : {}),
      ...(!cur.supplier_id && debt.supplier_id ? { supplier_id: debt.supplier_id } : {}),
    }).eq('id', refId).eq('tenant_id', tenantId)
    if (upErr) { console.error('[invoice-items] stock', upErr.message); failed++; continue }

    const [mvTable, mvCol] = it.item_type === 'tire' ? ['tire_sales', 'tire_id'] : ['product_sales', 'product_id']
    const mvRow = { tenant_id: tenantId, [mvCol]: refId, qty: it.qty, movement_type: 'order', sold_date: debt.date }
    let mv = await sb.from(mvTable).insert({ ...mvRow, source: 'invoice' }).select('id').single()
    // Before migration 109 there is no source column — record the arrival without it
    if (mv.error && /source|column/i.test(mv.error.message)) mv = await sb.from(mvTable).insert(mvRow).select('id').single()
    if (mv.error) console.error('[invoice-items] movement', mv.error.message)

    const { error: insErr } = await sb.from('supplier_invoice_items').insert({
      tenant_id: tenantId, debt_id, item_type: it.item_type, ref_id: refId,
      description: it.description.trim() || '—', qty: it.qty, unit_cost: cost, movement_id: mv.data?.id ?? null,
    })
    if (insErr) { console.error('[invoice-items] line', insErr.message); failed++ }
  }
  return NextResponse.json({ ok: failed === 0, failed }, { status: failed === lines.length ? 500 : 200 })
}

// DELETE /api/stock/invoice-items?id=… — remove a line and take its stock back out
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(['suppliers'])
  if ('error' in auth) return auth.error
  const tenantId = auth.profile.tenant_id
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const sb = createServiceClient()
  const { data: line } = await sb.from('supplier_invoice_items').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!line) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  if (line.ref_id) {
    const tbl = line.item_type === 'tire' ? 'tires' : 'products'
    const { data: cur } = await sb.from(tbl).select('qty').eq('id', line.ref_id).eq('tenant_id', tenantId).maybeSingle()
    if (cur) await sb.from(tbl).update({ qty: Math.max(0, (cur.qty ?? 0) - line.qty) }).eq('id', line.ref_id).eq('tenant_id', tenantId)
    if (line.movement_id) await sb.from(line.item_type === 'tire' ? 'tire_sales' : 'product_sales').delete().eq('id', line.movement_id)
  }
  const { error } = await sb.from('supplier_invoice_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
