import { NextResponse } from 'next/server'
import { requireYard } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard/suppliers — supplier names, as suggestions for "ordered from" on a waiting customer
export async function GET() {
  const auth = await requireYard('yard_requests')
  if ('error' in auth) return auth.error
  const { data, error } = await createServiceClient().from('suppliers').select('name')
    .eq('tenant_id', auth.user.tenantId).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(s => s.name).filter(Boolean))
}
