import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import WorkCardClient from '@/components/yard/WorkCardClient'
import type { YardSession, YardService } from '@/lib/yard/types'

export default async function WorkCardPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')

  const { id } = await params
  const supabase = await createClient()

  const [{ data: session }, { data: services }] = await Promise.all([
    supabase
      .from('yard_sessions')
      .select('*, yard_session_items(*)')
      .eq('id', id)
      .eq('tenant_id', auth.profile.tenant_id)
      .single(),
    supabase
      .from('yard_services')
      .select('*')
      .eq('tenant_id', auth.profile.tenant_id)
      .eq('is_active', true)
      .order('sort_order'),
  ])

  if (!session) notFound()

  return (
    <WorkCardClient
      session={session as YardSession}
      services={(services ?? []) as YardService[]}
    />
  )
}
