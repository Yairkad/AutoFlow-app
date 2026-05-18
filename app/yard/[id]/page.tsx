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

  // Auto-enrich: if make/model missing, fetch from plate API and persist
  if (!session.make && session.plate) {
    try {
      const plateRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://auto-flow-app.vercel.app'}/api/public/plate?plate=${encodeURIComponent(session.plate)}`,
        { cache: 'no-store' }
      )
      const vehicle = await plateRes.json()
      if (vehicle?.make) {
        await supabase
          .from('yard_sessions')
          .update({ make: vehicle.make, model: vehicle.model ?? null, year: vehicle.year ? String(vehicle.year) : null })
          .eq('id', session.id)
        session.make  = vehicle.make
        session.model = vehicle.model ?? null
        session.year  = vehicle.year ? String(vehicle.year) : session.year
      }
    } catch { /* non-critical */ }
  }

  return (
    <WorkCardClient
      session={session as YardSession}
      services={(services ?? []) as YardService[]}
    />
  )
}
