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
