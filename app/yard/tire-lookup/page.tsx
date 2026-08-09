import { getYardTenantId } from '@/lib/auth/yard-token'
import { redirect } from 'next/navigation'
import TireLookupClient from '@/components/yard/TireLookupClient'

export default function TireLookupPage() {
  const tenantId = getYardTenantId()
  if (!tenantId) redirect('/login')

  return <TireLookupClient />
}
