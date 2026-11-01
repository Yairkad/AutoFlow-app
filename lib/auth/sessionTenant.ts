import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'

/**
 * The caller's business, taken from their login — never from the request. Routes that used to
 * trust a `tenant_id` sent by the browser call this instead: a different tenant_id in the request
 * is refused (403), so a known business id alone no longer opens its Drive files.
 */
export async function sessionTenant(requested?: string | null, opts: { adminOnly?: boolean } = {}):
  Promise<{ error: NextResponse } | { tenantId: string }> {
  const auth = await requireAuth(opts.adminOnly ? [] : undefined)
  if ('error' in auth) return { error: auth.error }
  const tenantId = auth.profile.tenant_id
  if (requested && requested !== tenantId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { tenantId }
}
