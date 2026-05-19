import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createClient } from '@/lib/supabase/server'

// GET /api/yard/services
export async function GET() {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('yard_services')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/yard/services — admin only
export async function POST(req: NextRequest) {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error
  const { profile } = auth

  const body = await req.json()
  const { name, sku, price, sort_order } = body

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('yard_services')
    .insert({
      tenant_id:  profile.tenant_id,
      name,
      sku:        sku ?? null,
      price:      price ?? 0,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
