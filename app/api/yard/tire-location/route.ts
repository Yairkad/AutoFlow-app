import { NextRequest, NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { formatLocation, parseLocation } from '@/lib/stock/storage'

// PATCH /api/yard/tire-location { id, location } — the worker confirms where a received tire was put
export async function PATCH(req: NextRequest) {
  const auth = await requireYard('yard_receive')
  if ('error' in auth) return auth.error
  const { id, location } = await req.json().catch(() => ({})) as { id?: string; location?: string }
  const loc = formatLocation(parseLocation(location))
  if (!id || !loc) return NextResponse.json({ error: 'מיקום לא תקין' }, { status: 400 })
  const { data, error } = await createServiceClient().from('tires')
    .update({ location: loc }).eq('id', id).eq('tenant_id', auth.user.tenantId).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, location: loc })
}
