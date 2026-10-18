import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canYard, canYardMoney, type YardKey } from '@/lib/yard/access'

export function getYardTenantId(): string | null {
  return process.env.YARD_TENANT_ID ?? null
}

export interface YardUser {
  userId: string
  name: string | null
  tenantId: string
  isAdmin: boolean
  modules: string[]
  canMoney: boolean
}

/** The logged-in user of the worker terminal, or null when not signed in / inactive. */
export async function getYardUser(): Promise<YardUser | null> {
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
    name: p.full_name ?? user.email ?? null,
    tenantId: p.tenant_id,
    isAdmin,
    modules,
    canMoney: canYardMoney({ isAdmin, modules }),
  }
}

/** API guard for the worker-hub routes: signed in + allowed for this section. */
export async function requireYard(key: YardKey): Promise<{ error: NextResponse } | { user: YardUser }> {
  const user = await getYardUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canYard(user, key)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}
