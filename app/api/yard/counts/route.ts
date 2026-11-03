import { NextResponse } from 'next/server'
import { getYardUser } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { canYard } from '@/lib/yard/access'
import { OPEN_REQUEST_STATUSES, LOAN_STALE_DAYS } from '@/lib/yard/hub'

// GET /api/yard/counts — open-item badges for the worker sidebar
export async function GET() {
  const user = await getYardUser()
  if (!user) return NextResponse.json({}, { status: 401 })
  const sb = createServiceClient()
  const out: Record<string, number> = {}

  const staleBefore = new Date(Date.now() - LOAN_STALE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const [loans, requests, noStock, arrived, staleLoans] = await Promise.all([
    canYard(user, 'yard_loans')
      ? sb.from('tire_loans').select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId).eq('status', 'open')
      : null,
    canYard(user, 'yard_requests')
      ? sb.from('customer_requests').select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId).in('status', OPEN_REQUEST_STATUSES)
      : null,
    // Sold without stock, not yet sorted out (office tab "נמכר ללא מלאי"); set only on closed cards
    canYard(user, 'yard_reports')
      ? sb.from('yard_session_items').select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId).gt('no_stock_qty', 0).is('stock_resolved_at', null)
      : null,
    // Office drawer alerts: a waiting customer's tire arrived (call them), a loan open too long
    canYard(user, 'yard_requests')
      ? sb.from('customer_requests').select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId).eq('status', 'arrived')
      : null,
    canYard(user, 'yard_loans')
      ? sb.from('tire_loans').select('id', { count: 'exact', head: true })
          .eq('tenant_id', user.tenantId).eq('status', 'open').lte('loan_date', staleBefore)
      : null,
  ])
  if (loans?.count)    out.yard_loans    = loans.count
  if (requests?.count) out.yard_requests = requests.count
  if (noStock?.count)  out.no_stock      = noStock.count
  if (arrived?.count)  out.yard_requests_arrived = arrived.count
  if (staleLoans?.count) out.yard_loans_stale  = staleLoans.count
  return NextResponse.json(out)
}
