import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/vehicle-history?plate=1234567
export async function GET(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })

  const plate = req.nextUrl.searchParams.get('plate')?.replace(/\D/g, '')
  if (!plate || plate.length < 7)
    return NextResponse.json({ error: 'plate required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('yard_sessions')
    .select('id, closed_at, make, model, year, yard_session_items(name, unit_price, quantity, item_type, tire_position)')
    .eq('plate', plate)
    .eq('tenant_id', tenantId)
    .eq('status', 'archived')
    .order('closed_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
