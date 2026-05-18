import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import YardDashboard from '@/components/yard/YardDashboard'
import type { YardSession } from '@/lib/yard/types'

export default async function YardPage() {
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')

  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('yard_sessions')
    .select('*, yard_session_items(id, item_type, name, unit_price, quantity, price_modified)')
    .eq('tenant_id', auth.profile.tenant_id)
    .eq('status', 'active')
    .order('opened_at', { ascending: true })

  return <YardDashboard initialSessions={(sessions ?? []) as YardSession[]} />
}
