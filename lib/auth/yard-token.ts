import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canYard, canYardMoney, DEFAULT_YARD_MODULES, type YardKey } from '@/lib/yard/access'
import { YARD_COOKIE, verifyYardSession } from '@/lib/auth/yard-session'

export function getYardTenantId(): string | null {
  return process.env.YARD_TENANT_ID ?? null
}

export interface YardUser {
  userId: string | null      // auth user (office login); null for a PIN-login employee
  employeeId: string | null  // employees.id for a PIN-login employee
  name: string | null
  tenantId: string
  isAdmin: boolean
  modules: string[]
  canMoney: boolean
}

/** Employee signed in on the terminal with name + PIN, or null. */
export async function getYardEmployee(): Promise<YardUser | null> {
  const jar = await cookies()
  const s = await verifyYardSession(jar.get(YARD_COOKIE)?.value)
  if (!s) return null
  const { data: e } = await createServiceClient()
    .from('employees')
    .select('id, full_name, tenant_id, is_active, end_date, yard_modules')
    .eq('id', s.e)
    .eq('tenant_id', s.t)
    .maybeSingle()
  if (!e || e.is_active === false || (e.end_date && e.end_date < new Date().toISOString().slice(0, 10))) return null
  const modules: string[] = e.yard_modules ?? DEFAULT_YARD_MODULES
  return {
    userId: null,
    employeeId: e.id,
    name: e.full_name,
    tenantId: e.tenant_id,
    isAdmin: false,
    modules,
    canMoney: canYardMoney({ isAdmin: false, modules }),
  }
}

/** Office user (Gmail login) — used by the office pages that call /api/yard. */
async function getOfficeYardUser(): Promise<YardUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('full_name, tenant_id, role, allowed_modules, is_active')
    .eq('id', user.id)
    .single()
  if (!p || p.is_active === false) return null
  const isAdmin = p.role === 'admin' || p.role === 'super_admin'
  const modules: string[] = p.allowed_modules ?? []
  return {
    userId: user.id,
    employeeId: null,
    name: p.full_name ?? user.email ?? null,
    tenantId: p.tenant_id,
    isAdmin,
    modules,
    canMoney: canYardMoney({ isAdmin, modules }),
  }
}

/** Who is calling a yard route: the terminal employee first, else the office user. */
export async function getYardUser(): Promise<YardUser | null> {
  return (await getYardEmployee()) ?? (await getOfficeYardUser())
}

/** API guard for the worker-hub routes: signed in + allowed for this section. */
export async function requireYard(key: YardKey): Promise<{ error: NextResponse } | { user: YardUser }> {
  const user = await getYardUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canYard(user, key)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}
