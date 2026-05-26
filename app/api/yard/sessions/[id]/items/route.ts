import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// POST /api/yard/sessions/[id]/items — add one item or a batch of items
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id: sessionId } = await params

  const body = await req.json()
  const isBatch = Array.isArray(body)
  const rows = isBatch ? body : [body]

  for (const b of rows) {
    if (!b.item_type || !b.name || b.unit_price === undefined) {
      return NextResponse.json({ error: 'item_type, name, unit_price required' }, { status: 400 })
    }
  }

  const supabase = createServiceClient()

  // Verify session belongs to tenant
  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (session.status === 'archived') return NextResponse.json({ error: 'session is archived' }, { status: 400 })

  const inserts = rows.map(b => ({
    session_id:     sessionId,
    tenant_id:      profile.tenant_id,
    item_type:      b.item_type,
    ref_id:         b.ref_id ?? null,
    name:           b.name,
    sku:            b.sku ?? null,
    quantity:       b.quantity ?? 1,
    unit_price:     b.unit_price,
    original_price: b.original_price ?? b.unit_price,
    price_modified: b.price_modified ?? false,
    tire_position:  b.tire_position ?? null,
  }))

  const { data, error } = await supabase
    .from('yard_session_items')
    .insert(inserts)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(isBatch ? data : data[0], { status: 201 })
}
