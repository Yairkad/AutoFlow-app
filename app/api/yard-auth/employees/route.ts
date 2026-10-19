import { NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

// GET /api/yard-auth/employees — names for the terminal's login picker (public: names only).
// Lists active employees who have a yard PIN.
export async function GET() {
  const tenantId = getYardTenantId()
  if (!tenantId) return NextResponse.json({ error: 'YARD_TENANT_ID missing' }, { status: 500 })
  const sb = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: emps, error }, { data: pins }] = await Promise.all([
    sb.from('employees').select('id, full_name, is_active, end_date').eq('tenant_id', tenantId).order('full_name'),
    sb.from('yard_pins').select('employee_id').eq('tenant_id', tenantId),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const hasPin = new Set((pins ?? []).map(p => p.employee_id))
  const list = (emps ?? [])
    .filter(e => e.is_active !== false && (!e.end_date || e.end_date >= today) && hasPin.has(e.id))
    .map(e => ({ id: e.id, name: e.full_name }))
  return NextResponse.json(list)
}
