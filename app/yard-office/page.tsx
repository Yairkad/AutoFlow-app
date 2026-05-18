import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OfficeClient from '@/components/yard/OfficeClient'
import type { YardSession } from '@/lib/yard/types'

export default async function YardOfficePage() {
  const auth = await requireAuth([])   // admin only
  if ('error' in auth) redirect('/login')

  const supabase = await createClient()

  const [{ data: active }, { data: pending }] = await Promise.all([
    supabase
      .from('yard_sessions')
      .select('*, yard_session_items(*)')
      .eq('tenant_id', auth.profile.tenant_id)
      .eq('status', 'active')
      .order('opened_at'),
    supabase
      .from('yard_sessions')
      .select('*, yard_session_items(*)')
      .eq('tenant_id', auth.profile.tenant_id)
      .eq('status', 'pending_office')
      .order('opened_at'),
  ])

  return (
    <OfficeClient
      initialActive={(active   ?? []) as YardSession[]}
      initialPending={(pending ?? []) as YardSession[]}
    />
  )
}
