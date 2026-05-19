import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/sessions/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id } = await params

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('yard_sessions')
    .select(`
      *,
      yard_session_items(*, created_at)
    `)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/yard/sessions/[id] — change status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id } = await params

  const body = await req.json()
  const { status, make, model, year } = body

  const supabase = createServiceClient()

  // Vehicle info patch (background plate-lookup resolution)
  if (status === undefined && (make !== undefined || model !== undefined || year !== undefined)) {
    const vehicleUpdate: Record<string, unknown> = {}
    if (make  !== undefined) vehicleUpdate.make  = make
    if (model !== undefined) vehicleUpdate.model = model
    if (year  !== undefined) vehicleUpdate.year  = year
    const { data, error } = await supabase
      .from('yard_sessions')
      .update(vehicleUpdate)
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const allowed = ['active', 'pending_office', 'archived']
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }

  if (status === 'archived') {
    update.closed_at = new Date().toISOString()
    update.closed_by = null

    // Deduct inventory for all items with ref_id
    const { data: session } = await supabase
      .from('yard_sessions')
      .select('yard_session_items(item_type, ref_id, quantity)')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (session?.yard_session_items) {
      for (const item of session.yard_session_items as { item_type: string; ref_id: string | null; quantity: number }[]) {
        if (!item.ref_id) continue

        if (item.item_type === 'tire') {
          await supabase.rpc('decrement_tire_qty', { p_id: item.ref_id, p_qty: item.quantity })
        } else if (item.item_type === 'product') {
          await supabase.rpc('decrement_product_qty', { p_id: item.ref_id, p_qty: item.quantity })
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('yard_sessions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
