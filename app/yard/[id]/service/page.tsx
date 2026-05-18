import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ServiceGridClient from '@/components/yard/ServiceGridClient'
import type { YardSession, YardService } from '@/lib/yard/types'

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')

  const { id } = await params
  const supabase = await createClient()

  const [{ data: session }, { data: services }] = await Promise.all([
    supabase.from('yard_sessions').select('id,plate,make,model,year,yard_session_items(id,name)').eq('id', id).eq('tenant_id', auth.profile.tenant_id).single(),
    supabase.from('yard_services').select('*').eq('tenant_id', auth.profile.tenant_id).eq('is_active', true).order('sort_order'),
  ])

  if (!session) notFound()

  return (
    <ServiceGridClient
      session={session as YardSession}
      services={(services ?? []) as YardService[]}
    />
  )
}
