import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface AuthResult {
  user: { id: string; email?: string }
  profile: { role: string; tenant_id: string; allowed_modules: string[] }
}

/**
 * Server-side auth check for API routes.
 *
 * Usage:
 *   const auth = await requireAuth()           // any authenticated user
 *   const auth = await requireAuth([])          // admin / super_admin only
 *   const auth = await requireAuth(['products']) // must have module (admins bypass)
 *
 * Returns { error } if unauthorized — return that directly from the route handler.
 * Returns { user, profile } on success.
 */
export async function requireAuth(
  modules?: string[]
): Promise<{ error: NextResponse } | AuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, tenant_id, allowed_modules, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  // If no module requirement, just being authenticated is enough
  if (modules === undefined) {
    return { user, profile }
  }

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin'

  // Empty array = admin / super_admin only
  if (modules.length === 0 && !isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  // Admins bypass module checks
  if (isAdmin) return { user, profile }

  const userModules: string[] = profile.allowed_modules ?? []
  const hasModule = modules.some(m => userModules.includes(m))
  if (!hasModule) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, profile }
}
