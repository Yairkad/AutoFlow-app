import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/sessions?status=active|pending_office|all
export async function GET(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }

  const status = req.nextUrl.searchParams.get('status') ?? 'active'
  const supabase = createServiceClient()

  let query = supabase
    .from('yard_sessions')
    .select(`
      *,
      yard_session_items(id, item_type, name, sku, quantity, unit_price, price_modified, ref_id)
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('opened_at', { ascending: true })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/yard/sessions — open new session
export async function POST(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }

  const body = await req.json()
  const { plate, make, model, year } = body

  if (!plate) return NextResponse.json({ error: 'plate required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('yard_sessions')
    .insert({
      tenant_id: profile.tenant_id,
      plate: plate.replace(/[-\s]/g, '').toUpperCase(),
      make:  make  ?? null,
      model: model ?? null,
      year:  year  ?? null,
      opened_by: null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
