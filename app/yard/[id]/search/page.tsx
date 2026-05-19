import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect, notFound } from 'next/navigation'
import FreeSearchClient from '@/components/yard/FreeSearchClient'
import type { YardSession } from '@/lib/yard/types'

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const tenantId = getYardTenantId()
  if (!tenantId) redirect('/login')

  const { id }   = await params
  const { type } = await searchParams
  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id,plate,make,model,year,yard_session_items(id,name)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single()

  if (!session) notFound()

  return (
    <FreeSearchClient
      session={session as YardSession}
      filterType={(type as 'all' | 'product' | 'tire' | 'service') ?? 'all'}
    />
  )
}
