import { createServiceClient } from '@/lib/supabase/service'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'
import LoginClient from './LoginClient'

// The login screen shows the business's own name and logo (falls back to AutoFlow)
export default async function LoginPage() {
  let brand: { name: string; logo: string | null } = { name: 'AutoFlow', logo: null }
  try {
    const { data } = await createServiceClient()
      .from('tenants').select('name, logo_base64').eq('id', LANDING_TENANT_ID).maybeSingle()
    if (data?.name) brand = { name: data.name, logo: data.logo_base64 || null }
  } catch { /* no DB — keep the default */ }
  return <LoginClient brand={brand} />
}
