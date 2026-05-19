import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// PATCH /api/yard/services/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const { id } = await params

  const body = await req.json()
  const allowed = ['name', 'price', 'sku', 'is_active', 'sort_order']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('yard_services')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/yard/services/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const { id } = await params

  const supabase = createServiceClient()
  await supabase.from('yard_services').delete().eq('id', id).eq('tenant_id', tenantId)
  return NextResponse.json({ ok: true })
}
