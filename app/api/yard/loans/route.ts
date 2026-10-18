import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/loans?status=open|closed|all
export async function GET(req: NextRequest) {
  const auth = await requireYard('yard_loans')
  if ('error' in auth) return auth.error
  const status = req.nextUrl.searchParams.get('status') ?? 'open'

  let q = createServiceClient().from('tire_loans').select('*')
    .eq('tenant_id', auth.user.tenantId)
  if (status === 'open')   q = q.eq('status', 'open')
  if (status === 'closed') q = q.neq('status', 'open')
  const { data, error } = await q
    .order('loan_date', { ascending: status === 'open' })
    .order('created_at', { ascending: status === 'open' })
    .limit(status === 'open' ? 1000 : 300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/yard/loans
export async function POST(req: NextRequest) {
  const auth = await requireYard('yard_loans')
  if ('error' in auth) return auth.error
  const b = await req.json()

  if (!['borrowed', 'lent'].includes(b.direction) || !b.shop_name?.trim() || !b.item_desc?.trim()) {
    return NextResponse.json({ error: 'direction, shop_name, item_desc required' }, { status: 400 })
  }

  const { data, error } = await createServiceClient().from('tire_loans').insert({
    tenant_id:       auth.user.tenantId,
    direction:       b.direction,
    shop_name:       b.shop_name.trim(),
    shop_phone:      b.shop_phone?.trim() || null,
    loan_date:       b.loan_date || undefined,
    item_desc:       b.item_desc.trim(),
    tire_id:         b.tire_id || null,
    qty:             Math.max(1, Number(b.qty) || 1),
    customer_name:   b.customer_name?.trim() || null,
    plate:           b.plate?.trim() || null,
    notes:           b.notes?.trim() || null,
    created_by:      auth.user.userId,
    created_by_name: auth.user.name,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
