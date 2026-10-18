import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

const EDITABLE = ['direction', 'shop_name', 'shop_phone', 'loan_date', 'item_desc', 'qty',
  'customer_name', 'plate', 'amount', 'notes'] as const

// PATCH /api/yard/loans/[id] — edit fields and/or close (status returned|paid) / reopen (open)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireYard('yard_loans')
  if ('error' in auth) return auth.error
  const { id } = await params
  const b = await req.json()

  const update: Record<string, unknown> = {}
  for (const k of EDITABLE) if (b[k] !== undefined) update[k] = typeof b[k] === 'string' ? (b[k].trim() || null) : b[k]
  if (b.status !== undefined) {
    if (!['open', 'returned', 'paid'].includes(b.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status    = b.status
    update.closed_at = b.status === 'open' ? null : new Date().toISOString()
  }

  const { data, error } = await createServiceClient().from('tire_loans').update(update)
    .eq('id', id).eq('tenant_id', auth.user.tenantId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireYard('yard_loans')
  if ('error' in auth) return auth.error
  const { id } = await params
  const { error } = await createServiceClient().from('tire_loans').delete()
    .eq('id', id).eq('tenant_id', auth.user.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
