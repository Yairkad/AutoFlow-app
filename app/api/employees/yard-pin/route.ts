import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createServiceClient } from '@/lib/supabase/service'
import { hashPin, PIN_RE } from '@/lib/auth/yard-pin'

// GET  /api/employees/yard-pin            → ids of employees that have a yard PIN (admin)
// POST /api/employees/yard-pin { employeeId, pin } — set (pin) or remove (pin: null) the yard login PIN
export async function GET() {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error
  const { data, error } = await createServiceClient()
    .from('yard_pins').select('employee_id').eq('tenant_id', auth.profile.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(r => r.employee_id))
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error
  const tenantId = auth.profile.tenant_id

  const { employeeId, pin } = await req.json().catch(() => ({})) as { employeeId?: string; pin?: string | null }
  if (!employeeId) return NextResponse.json({ error: 'Missing employeeId' }, { status: 400 })

  const sb = createServiceClient()
  const { data: emp } = await sb.from('employees').select('id').eq('id', employeeId).eq('tenant_id', tenantId).maybeSingle()
  if (!emp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (pin === null) {
    const { error } = await sb.from('yard_pins').delete().eq('employee_id', employeeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (typeof pin !== 'string' || !PIN_RE.test(pin))
    return NextResponse.json({ error: 'הקוד חייב להיות 4–8 ספרות' }, { status: 400 })

  const { error } = await sb.from('yard_pins').upsert({
    employee_id: employeeId, tenant_id: tenantId, pin_hash: await hashPin(pin),
    failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
