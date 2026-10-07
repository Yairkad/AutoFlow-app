import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { INTAKE_BUCKET, type IntakeFile } from '@/lib/inspections/intake'

// Office-side access to the documents a customer uploaded through the pre-fill link.
// The bucket is private: after checking the inspection belongs to the caller's tenant we hand
// out short-lived signed URLs (GET) or remove the objects when the inspection is deleted (DELETE).

async function authorizedRow(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sb = createServiceClient()
  const [{ data: profile }, { data: row }] = await Promise.all([
    sb.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle(),
    sb.from('car_inspections').select('id, tenant_id, intake_files').eq('id', id).maybeSingle(),
  ])
  if (!profile?.tenant_id || !row || row.tenant_id !== profile.tenant_id) return null
  return { sb, files: (row.intake_files ?? []) as IntakeFile[] }
}

export async function GET(req: NextRequest) {
  const auth = await authorizedRow(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.files.length) return NextResponse.json({ files: [] })

  const { data, error } = await auth.sb.storage.from(INTAKE_BUCKET)
    .createSignedUrls(auth.files.map(f => f.path), 60 * 30)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    files: auth.files.map((f, i) => ({ ...f, url: data?.[i]?.signedUrl ?? null })),
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizedRow(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.files.length) await auth.sb.storage.from(INTAKE_BUCKET).remove(auth.files.map(f => f.path))
  return NextResponse.json({ ok: true })
}
