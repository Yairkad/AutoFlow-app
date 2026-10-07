import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { newIntakeToken } from '@/lib/inspections/intake'

// The business's fixed pre-fill link (printed as a QR). GET returns it, creating it on first use;
// POST replaces it (admins only) so an old printed QR stops working, e.g. after spam.

async function caller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const sb = createServiceClient()
  const { data: profile } = await sb.from('profiles').select('tenant_id, role').eq('id', user.id).maybeSingle()
  if (!profile?.tenant_id) return null
  return { sb, tenantId: profile.tenant_id as string, isAdmin: profile.role === 'admin' || profile.role === 'super_admin' }
}

async function setToken(c: NonNullable<Awaited<ReturnType<typeof caller>>>) {
  const token = newIntakeToken()
  const { error } = await c.sb.from('tenants').update({ intake_public_token: token }).eq('id', c.tenantId)
  return error ? null : token
}

export async function GET() {
  const c = await caller()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await c.sb.from('tenants').select('intake_public_token').eq('id', c.tenantId).maybeSingle()
  const token = data?.intake_public_token ?? await setToken(c)
  if (!token) return NextResponse.json({ error: 'שגיאה ביצירת הקישור' }, { status: 500 })
  return NextResponse.json({ token, canRegenerate: c.isAdmin })
}

export async function POST() {
  const c = await caller()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!c.isAdmin) return NextResponse.json({ error: 'רק מנהל יכול להחליף את הקישור' }, { status: 403 })
  const token = await setToken(c)
  if (!token) return NextResponse.json({ error: 'שגיאה בהחלפת הקישור' }, { status: 500 })
  return NextResponse.json({ token, canRegenerate: true })
}
