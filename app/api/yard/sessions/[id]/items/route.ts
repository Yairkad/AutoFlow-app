import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createClient } from '@/lib/supabase/server'

// POST /api/yard/sessions/[id]/items — add item to session
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }
  const { id: sessionId } = await params

  const body = await req.json()
  const { item_type, ref_id, name, sku, quantity, unit_price, original_price, price_modified } = body

  if (!item_type || !name || unit_price === undefined) {
    return NextResponse.json({ error: 'item_type, name, unit_price required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify session belongs to tenant
  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (session.status === 'archived') return NextResponse.json({ error: 'session is archived' }, { status: 400 })

  const { data, error } = await supabase
    .from('yard_session_items')
    .insert({
      session_id:     sessionId,
      tenant_id:      profile.tenant_id,
      item_type,
      ref_id:         ref_id ?? null,
      name,
      sku:            sku ?? null,
      quantity:       quantity ?? 1,
      unit_price,
      original_price: original_price ?? unit_price,
      price_modified: price_modified ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
