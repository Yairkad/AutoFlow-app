import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { parseTireSize } from '@/lib/tires/size'
import { selectAll } from '@/lib/supabase/selectAll'
import type { QuickReport } from '@/lib/yard/reports'

// GET /api/yard/reports?fromTs=ISO&toTs=ISO&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
//   sold     = work cards closed (archived) in the range
//   received = incoming stock movements ('order') in the range
// Money fields are left out unless the user may see them.
export async function GET(req: NextRequest) {
  const auth = await requireYard('yard_reports')
  if ('error' in auth) return auth.error
  const sp = req.nextUrl.searchParams
  const fromTs = sp.get('fromTs'), toTs = sp.get('toTs')
  const fromDate = sp.get('fromDate'), toDate = sp.get('toDate')
  if (!fromTs || !toTs || !fromDate || !toDate) {
    return NextResponse.json({ error: 'fromTs, toTs, fromDate, toDate required' }, { status: 400 })
  }

  const sb  = createServiceClient()
  const tid = auth.user.tenantId
  const money = auth.user.canMoney

  const [sessionsRes, tireInRes, prodInRes] = await Promise.all([
    selectAll((a, b) => sb.from('yard_sessions')
      .select('id, yard_session_items(item_type, name, quantity, unit_price)')
      .eq('tenant_id', tid).eq('status', 'archived')
      .gte('closed_at', fromTs).lt('closed_at', toTs)
      .order('closed_at').range(a, b)),
    selectAll((a, b) => sb.from('tire_sales')
      .select('qty, tires(brand, width, profile, rim, cost_price)')
      .eq('tenant_id', tid).eq('movement_type', 'order')
      .gte('sold_date', fromDate).lte('sold_date', toDate)
      .order('id').range(a, b)),
    selectAll((a, b) => sb.from('product_sales')
      .select('qty, products(name, buy_price)')
      .eq('tenant_id', tid).eq('movement_type', 'order')
      .gte('sold_date', fromDate).lte('sold_date', toDate)
      .order('id').range(a, b)),
  ])
  const err = sessionsRes.error || tireInRes.error || prodInRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const report: QuickReport = {
    canMoney: money,
    sold: {
      cars: sessionsRes.data.length,
      total: 0,
      byType: { tire: { qty: 0, amount: 0 }, product: { qty: 0, amount: 0 }, service: { qty: 0, amount: 0 } },
      topTires: [],
    },
    received: { tires: 0, products: 0, cost: 0, topTires: [] },
  }

  const soldSizes = new Map<string, number>()
  for (const s of sessionsRes.data) {
    for (const it of (s.yard_session_items ?? []) as { item_type: 'tire' | 'product' | 'service'; name: string; quantity: number; unit_price: number }[]) {
      const amount = Number(it.unit_price) * it.quantity
      const bucket = report.sold.byType[it.item_type]
      if (!bucket) continue
      bucket.qty += it.quantity
      bucket.amount += amount
      report.sold.total += amount
      if (it.item_type === 'tire') {
        const sz = parseTireSize(it.name)
        const key = sz ? `${sz.width}/${sz.profile}R${sz.rim}` : it.name
        soldSizes.set(key, (soldSizes.get(key) ?? 0) + it.quantity)
      }
    }
  }

  const inSizes = new Map<string, number>()
  type TireIn = { qty: number; tires: { brand: string | null; width: number | null; profile: number | null; rim: number | null; cost_price: number | null } | null }
  for (const m of tireInRes.data as unknown as TireIn[]) {
    report.received.tires += m.qty
    report.received.cost += m.qty * Number(m.tires?.cost_price ?? 0)
    const t = m.tires
    const key = t?.width && t.profile && t.rim ? `${t.width}/${t.profile}R${t.rim}` : (t?.brand || 'ללא מידה')
    inSizes.set(key, (inSizes.get(key) ?? 0) + m.qty)
  }
  type ProdIn = { qty: number; products: { name: string; buy_price: number | null } | null }
  for (const m of prodInRes.data as unknown as ProdIn[]) {
    report.received.products += Number(m.qty)
    report.received.cost += Number(m.qty) * Number(m.products?.buy_price ?? 0)
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, qty]) => ({ label, qty }))
  report.sold.topTires = top(soldSizes)
  report.received.topTires = top(inSizes)

  if (!money) {
    report.sold.total = 0
    report.received.cost = 0
    for (const b of Object.values(report.sold.byType)) b.amount = 0
  }
  return NextResponse.json(report)
}
