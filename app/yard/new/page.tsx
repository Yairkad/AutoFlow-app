import { getYardTenantId } from '@/lib/auth/yard-token'
import { redirect } from 'next/navigation'
import NewCarClient from '@/components/yard/NewCarClient'

export default async function NewCarPage() {
  const tenantId = getYardTenantId()
  if (!tenantId) redirect('/login')
  return <NewCarClient />
}
