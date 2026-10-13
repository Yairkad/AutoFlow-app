import { createServiceClient } from '@/lib/supabase/service'

/**
 * Tenant behind an intake link: a personal link (one inspection's intake_token)
 * or the business's fixed link / QR (tenants.intake_public_token).
 */
export async function getIntakeTenant(token: string): Promise<{ name: string; logo: string | null } | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const sb = createServiceClient()
  const { data } = await sb.from('car_inspections').select('tenant_id').eq('intake_token', token).maybeSingle()
  const { data: t } = data
    ? await sb.from('tenants').select('name, logo_base64').eq('id', data.tenant_id).maybeSingle()
    : await sb.from('tenants').select('name, logo_base64').eq('intake_public_token', token).maybeSingle()
  return t ? { name: t.name ?? '', logo: t.logo_base64 ?? null } : null
}
