import { NextResponse } from 'next/server'
import { getYardUser } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { selectAll } from '@/lib/supabase/selectAll'
import type { StockSummary } from '@/lib/yard/reports'

// GET /api/yard/stock-summary — tire stock value + how fresh the stock data is (office only)
export async function GET() {
  const user = await getYardUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.canMoney) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sb = createServiceClient()
  const tid = user.tenantId

  const [tiresRes, lastInRes, lastCountRes] = await Promise.all([
    selectAll<{ qty: number; cost_price: number | null; sell_price: number | null }>((a, b) =>
      sb.from('tires').select('qty, cost_price, sell_price').eq('tenant_id', tid).gt('qty', 0).order('id').range(a, b)),
    sb.from('tire_sales').select('sold_date, created_at').eq('tenant_id', tid).eq('movement_type', 'order')
      .order('sold_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    sb.from('tire_inventory_count_sessions').select('counted_at, zone').eq('tenant_id', tid)
      .order('counted_at', { ascending: false }).limit(10),
  ])
  if (tiresRes.error) return NextResponse.json({ error: tiresRes.error.message }, { status: 500 })

  const out: StockSummary = {
    tireCount: 0, tireModels: 0, costValue: 0, sellValue: 0, missingCost: 0,
    lastReceiveDate: lastInRes.data?.[0]?.sold_date ?? null,
    // an empty zone only marks a new count round
    lastCountDate:   lastCountRes.data?.find(s => !s.zone || s.zone.length)?.counted_at ?? null,
  }
  for (const t of tiresRes.data) {
    out.tireCount += t.qty
    out.tireModels++
    if (t.cost_price) out.costValue += t.qty * Number(t.cost_price)
    else out.missingCost++
    out.sellValue += t.qty * Number(t.sell_price ?? 0)
  }
  return NextResponse.json(out)
}
