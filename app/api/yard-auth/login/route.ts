import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { checkPin, MAX_PIN_ATTEMPTS, PIN_LOCK_MS, PIN_RE } from '@/lib/auth/yard-pin'
import { signYardSession, YARD_COOKIE, YARD_SESSION_MAX_AGE } from '@/lib/auth/yard-session'

// POST /api/yard-auth/login  { employeeId, pin }
// Correct PIN → signed yard cookie. MAX_PIN_ATTEMPTS wrong PINs lock that employee for PIN_LOCK_MS.
export async function POST(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return NextResponse.json({ error: 'YARD_TENANT_ID missing' }, { status: 500 })
  const { employeeId, pin } = await req.json().catch(() => ({})) as { employeeId?: string; pin?: string }
  if (!employeeId || !pin || !PIN_RE.test(pin)) return NextResponse.json({ error: 'קוד שגוי' }, { status: 400 })

  const sb = createServiceClient()
  const { data: row } = await sb.from('yard_pins')
    .select('pin_hash, failed_attempts, locked_until')
    .eq('employee_id', employeeId).eq('tenant_id', tenantId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'לעובד הזה אין קוד כניסה' }, { status: 404 })

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const sec = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000)
    return NextResponse.json({ error: `יותר מדי ניסיונות — נסה שוב בעוד ${sec} שניות` }, { status: 429 })
  }

  const { data: emp } = await sb.from('employees').select('is_active, end_date').eq('id', employeeId).eq('tenant_id', tenantId).maybeSingle()
  const today = new Date().toISOString().slice(0, 10)
  if (!emp || emp.is_active === false || (emp.end_date && emp.end_date < today))
    return NextResponse.json({ error: 'העובד לא פעיל' }, { status: 403 })

  if (!(await checkPin(pin, row.pin_hash))) {
    const failed = (row.failed_attempts ?? 0) + 1
    const lock = failed >= MAX_PIN_ATTEMPTS
    await sb.from('yard_pins').update({
      failed_attempts: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null,
    }).eq('employee_id', employeeId)
    return NextResponse.json({ error: lock ? 'יותר מדי ניסיונות — נסה שוב בעוד דקה' : 'קוד שגוי' }, { status: 401 })
  }

  if (row.failed_attempts || row.locked_until)
    await sb.from('yard_pins').update({ failed_attempts: 0, locked_until: null }).eq('employee_id', employeeId)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(YARD_COOKIE, await signYardSession(employeeId, tenantId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: YARD_SESSION_MAX_AGE,
  })
  return res
}
