import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// DELETE /api/yard/sessions/[id]/items/[itemId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id: sessionId, itemId } = await params

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('yard_session_items')
    .delete()
    .eq('id', itemId)
    .eq('session_id', sessionId)
    .eq('tenant_id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/yard/sessions/[id]/items/[itemId] — update price or quantity
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id: sessionId, itemId } = await params

  const body = await req.json()
  const update: Record<string, unknown> = {}

  if (body.unit_price !== undefined) {
    update.unit_price     = body.unit_price
    update.price_modified = true
  }
  if (body.quantity !== undefined) update.quantity = body.quantity

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('yard_session_items')
    .update(update)
    .eq('id', itemId)
    .eq('session_id', sessionId)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
