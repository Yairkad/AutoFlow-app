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

type Caller = NonNullable<Awaited<ReturnType<typeof caller>>>
type DbError = { code?: string; message?: string } | null

// Column missing = migration 085 wasn't run (Postgres 42703 / PostgREST schema-cache PGRST204).
const MISSING_COLUMN = (e: DbError) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /intake_public_token/.test(e.message ?? ''))

function dbFailure(e: DbError, fallback: string) {
  console.error('public-link:', e)
  return NextResponse.json(
    { error: MISSING_COLUMN(e) ? 'חסר עדכון במסד הנתונים – יש להריץ ב-Supabase את מיגרציה 085' : fallback },
    { status: 500 },
  )
}

async function setToken(c: Caller): Promise<{ token: string; error: null } | { token: null; error: DbError }> {
  const token = newIntakeToken()
  const { error } = await c.sb.from('tenants').update({ intake_public_token: token }).eq('id', c.tenantId)
  return error ? { token: null, error } : { token, error: null }
}

export async function GET() {
  const c = await caller()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await c.sb.from('tenants').select('intake_public_token').eq('id', c.tenantId).maybeSingle()
  if (error) return dbFailure(error, 'שגיאה ביצירת הקישור')
  if (data?.intake_public_token) return NextResponse.json({ token: data.intake_public_token, canRegenerate: c.isAdmin })
  const created = await setToken(c)
  if (!created.token) return dbFailure(created.error, 'שגיאה ביצירת הקישור')
  return NextResponse.json({ token: created.token, canRegenerate: c.isAdmin })
}

export async function POST() {
  const c = await caller()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!c.isAdmin) return NextResponse.json({ error: 'רק מנהל יכול להחליף את הקישור' }, { status: 403 })
  const created = await setToken(c)
  if (!created.token) return dbFailure(created.error, 'שגיאה בהחלפת הקישור')
  return NextResponse.json({ token: created.token, canRegenerate: true })
}
