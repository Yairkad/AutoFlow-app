import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/yard/services/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { profile } = auth
  const { id } = await params

  const body = await req.json()
  const allowed = ['name', 'price', 'sku', 'is_active', 'sort_order']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('yard_services')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/yard/services/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { profile } = auth
  const { id } = await params

  const supabase = await createClient()
  await supabase.from('yard_services').delete().eq('id', id).eq('tenant_id', profile.tenant_id)
  return NextResponse.json({ ok: true })
}
