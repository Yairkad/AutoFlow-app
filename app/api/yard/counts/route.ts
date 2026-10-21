import { NextResponse } from 'next/server'
import { getYardUser } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { canYard } from '@/lib/yard/access'
import { OPEN_REQUEST_STATUSES } from '@/lib/yard/hub'

// GET /api/yard/counts — open-item badges for the worker sidebar
export async function GET() {
  const user = await getYardUser()
  if (!user) return NextResponse.json({}, { status: 401 })
  const sb = createServiceClient()
  const out: Record<string, number> = {}

  const [loans, requests, noStock] = await Promise.all([
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
  ])
  if (loans?.count)    out.yard_loans    = loans.count
  if (requests?.count) out.yard_requests = requests.count
  if (noStock?.count)  out.no_stock      = noStock.count
  return NextResponse.json(out)
}
