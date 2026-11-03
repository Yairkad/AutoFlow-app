import { NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/tire-brands — existing tire brands (most used first) + their Hebrew names,
// as autocomplete suggestions so the same brand isn't typed in several spellings
export async function GET() {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const sb = createServiceClient()
  const [{ data: tires, error }, { data: he }] = await Promise.all([
    sb.from('tires').select('brand').eq('tenant_id', tenantId).not('brand', 'is', null).limit(10000),
    sb.from('tire_brands').select('name_en, name_he').eq('tenant_id', tenantId),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brands: (tires ?? []).map(t => t.brand as string), he: he ?? [] })
}
