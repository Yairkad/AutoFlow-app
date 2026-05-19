import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect, notFound } from 'next/navigation'
import TireSearchClient from '@/components/yard/TireSearchClient'
import type { YardSession } from '@/lib/yard/types'

export default async function TirePage({ params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) redirect('/login')

  const { id } = await params
  const supabase = createServiceClient()
  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id, plate, make, model, year')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!session) notFound()
  return <TireSearchClient session={session as YardSession} />
}
