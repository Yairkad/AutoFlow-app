import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { parseTireSize } from '@/lib/tires/size'
import { OPEN_REQUEST_STATUSES } from '@/lib/yard/hub'

// GET /api/yard/requests?status=open|closed|all
export async function GET(req: NextRequest) {
  const auth = await requireYard('yard_requests')
  if ('error' in auth) return auth.error
  const status = req.nextUrl.searchParams.get('status') ?? 'open'

  let q = createServiceClient().from('customer_requests').select('*')
    .eq('tenant_id', auth.user.tenantId)
  if (status === 'open')   q = q.in('status', OPEN_REQUEST_STATUSES)
  if (status === 'closed') q = q.in('status', ['closed', 'cancelled'])
  const { data, error } = await q
    .order('created_at', { ascending: status === 'open' })
    .limit(status === 'open' ? 1000 : 300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/yard/requests
export async function POST(req: NextRequest) {
  const auth = await requireYard('yard_requests')
  if ('error' in auth) return auth.error
  const b = await req.json()

  if (!b.customer_name?.trim() || !b.item_desc?.trim()) {
    return NextResponse.json({ error: 'customer_name, item_desc required' }, { status: 400 })
  }
  const size = parseTireSize(b.item_desc)

  const { data, error } = await createServiceClient().from('customer_requests').insert({
    tenant_id:       auth.user.tenantId,
    kind:            b.kind === 'inquiry' ? 'inquiry' : 'order',
    customer_name:   b.customer_name.trim(),
    phone:           b.phone?.trim() || null,
    plate:           b.plate?.trim() || null,
    item_desc:       b.item_desc.trim(),
    tire_width:      size?.width ?? null,
    tire_profile:    size?.profile ?? null,
    tire_rim:        size?.rim ?? null,
    qty:             Math.max(1, Number(b.qty) || 1),
    quoted_price:    b.quoted_price !== '' && b.quoted_price != null ? Number(b.quoted_price) : null,
    notes:           b.notes?.trim() || null,
    created_by:      auth.user.userId,
    created_by_name: auth.user.name,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
