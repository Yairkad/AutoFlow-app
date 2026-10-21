import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { parseTireSize } from '@/lib/tires/size'

const EDITABLE = ['kind', 'customer_name', 'phone', 'plate', 'item_desc', 'qty', 'quoted_price', 'notes', 'supplier_name', 'install_at'] as const
const PAYMENT = ['unpaid', 'partial', 'paid']
const STATUSES = ['new', 'ordered', 'arrived', 'notified', 'closed', 'cancelled']

// PATCH /api/yard/requests/[id] — edit fields and/or move status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireYard('yard_requests')
  if ('error' in auth) return auth.error
  const { id } = await params
  const b = await req.json()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) if (b[k] !== undefined) update[k] = typeof b[k] === 'string' ? (b[k].trim() || null) : b[k]
  if (typeof b.item_desc === 'string') {
    const size = parseTireSize(b.item_desc)
    update.tire_width = size?.width ?? null
    update.tire_profile = size?.profile ?? null
    update.tire_rim = size?.rim ?? null
  }
  if (b.payment_status !== undefined) {
    if (!PAYMENT.includes(b.payment_status)) return NextResponse.json({ error: 'invalid payment_status' }, { status: 400 })
    update.payment_status = b.payment_status
    // amount only means something for a partial payment
    update.paid_amount = b.payment_status === 'partial' && Number(b.paid_amount) > 0 ? Number(b.paid_amount) : null
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    update.status = b.status
  }

  const { data, error } = await createServiceClient().from('customer_requests').update(update)
    .eq('id', id).eq('tenant_id', auth.user.tenantId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireYard('yard_requests')
  if ('error' in auth) return auth.error
  const { id } = await params
  const { error } = await createServiceClient().from('customer_requests').delete()
    .eq('id', id).eq('tenant_id', auth.user.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
