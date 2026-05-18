import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'
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
  const auth = await requireAuth()
  if ('error' in auth) redirect('/login')

  const { id }   = await params
  const { type } = await searchParams
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('yard_sessions')
    .select('id,plate,make,model,year,yard_session_items(id,name)')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!session) notFound()

  return (
    <FreeSearchClient
      session={session as YardSession}
      filterType={(type as 'all' | 'product' | 'tire' | 'service') ?? 'all'}
    />
  )
}
