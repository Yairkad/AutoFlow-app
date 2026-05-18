import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TireSearchClient from '@/components/yard/TireSearchClient'
import type { YardSession } from '@/lib/yard/types'

export default async function TirePage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')

  const { id } = await params
  const supabase = await createClient()
  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id, plate, make, model, year')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!session) notFound()
  return <TireSearchClient session={session as YardSession} />
}
