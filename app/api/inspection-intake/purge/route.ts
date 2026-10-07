import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { INTAKE_BUCKET, INTAKE_FILE_RETENTION_DAYS, type IntakeFile } from '@/lib/inspections/intake'

// Retention for customer-uploaded documents (ID cards, vehicle license): delete them
// INTAKE_FILE_RETENTION_DAYS after the customer arrived, or after they submitted the form if
// they never arrived. Triggered by the inspections screen on load (scoped to the caller's
// tenant) — the typed details on the inspection itself are kept.

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createServiceClient()
  const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cutoff = new Date(Date.now() - INTAKE_FILE_RETENTION_DAYS * 86_400_000).toISOString()
  const { data: rows, error } = await sb
    .from('car_inspections')
    .select('id, intake_files')
    .eq('tenant_id', profile.tenant_id)
    .or(`intake_arrived_at.lt.${cutoff},and(intake_status.eq.submitted,intake_submitted_at.lt.${cutoff})`)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let purged = 0
  for (const row of rows ?? []) {
    const files = (row.intake_files ?? []) as IntakeFile[]
    if (!files.length) continue
    const { error: rmErr } = await sb.storage.from(INTAKE_BUCKET).remove(files.map(f => f.path))
    if (rmErr) { console.error('intake purge failed:', rmErr); continue }
    await sb.from('car_inspections').update({ intake_files: [] }).eq('id', row.id)
    purged++
  }
  return NextResponse.json({ purged })
}
