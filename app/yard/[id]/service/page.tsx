import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect, notFound } from 'next/navigation'
import ServiceGridClient from '@/components/yard/ServiceGridClient'
import type { YardSession, YardService } from '@/lib/yard/types'

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const tenantId = getYardTenantId()
  if (!tenantId) redirect('/login')

  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: session }, { data: services }] = await Promise.all([
    supabase.from('yard_sessions').select('id,plate,make,model,year,yard_session_items(id,name)').eq('id', id).eq('tenant_id', tenantId).single(),
    supabase.from('yard_services').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
  ])

  if (!session) notFound()

  // These services have dedicated quick-action buttons on the work card — exclude from grid
  const QUICK_ACTIONS = new Set(['תיקון תקר', 'כיוון פרונט'])
  const gridServices = (services ?? []).filter(s => !QUICK_ACTIONS.has(s.name))

  return (
    <ServiceGridClient
      session={session as YardSession}
      services={gridServices as YardService[]}
    />
  )
}
