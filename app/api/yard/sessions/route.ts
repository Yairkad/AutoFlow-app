import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/sessions?status=active|pending_office|archived|all
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
  // Closed cards: newest first, last N days only (?days=, default 7)
  if (status === 'archived') {
    const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 7))
    query = query.gte('closed_at', new Date(Date.now() - days * 86_400_000).toISOString())
      .order('closed_at', { ascending: false }).limit(100)
  }

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
  const cleanPlate = String(plate).replace(/[-\s]/g, '').toUpperCase()

  // Same car already has an open card (typed twice by mistake) — reuse it instead of opening a duplicate
  const { data: existing } = await supabase
    .from('yard_sessions')
    .select()
    .eq('tenant_id', profile.tenant_id)
    .eq('plate', cleanPlate)
    .in('status', ['active', 'pending_office'])
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    // Car came back to the yard while waiting for the office — put it back in work (no stock side effects)
    if (existing.status === 'pending_office') {
      const { data: reopened } = await supabase.from('yard_sessions').update({ status: 'active' })
        .eq('id', existing.id).eq('tenant_id', profile.tenant_id).select().single()
      if (reopened) return NextResponse.json({ ...reopened, existing: true }, { status: 200 })
    }
    return NextResponse.json({ ...existing, existing: true }, { status: 200 })
  }

  const { data, error } = await supabase
    .from('yard_sessions')
    .insert({
      tenant_id: profile.tenant_id,
      plate: cleanPlate,
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
