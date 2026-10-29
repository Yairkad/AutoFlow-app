import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { INTAKE_BUCKET, INTAKE_MAX_FILE_BYTES, type IntakeFile } from '@/lib/inspections/intake'

// Office-side access to the documents a customer uploaded through the pre-fill link.
// The bucket is private: after checking the inspection belongs to the caller's tenant we hand
// out short-lived signed URLs (GET) or remove the objects when the inspection is deleted (DELETE).
// The office can add its own scans of the customer's documents (POST, kind 'office_doc') and remove
// one document (DELETE ?path=).

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
  return { sb, row, files: (row.intake_files ?? []) as IntakeFile[] }
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

const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/

export async function POST(req: NextRequest) {
  const auth = await authorizedRow(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const f = fd.get('file')
  if (!(f instanceof File) || f.size === 0) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  if (f.size > INTAKE_MAX_FILE_BYTES) return NextResponse.json({ error: 'קובץ גדול מדי (מקסימום 4MB)' }, { status: 400 })
  if (!ALLOWED_TYPES.test(f.type)) return NextResponse.json({ error: 'ניתן להעלות רק תמונה או PDF' }, { status: 400 })

  const ext  = f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '').slice(0, 5)
  const path = `${auth.row.tenant_id}/${auth.row.id}/office-${Date.now()}.${ext}`
  const { error: upErr } = await auth.sb.storage.from(INTAKE_BUCKET).upload(path, f, { contentType: f.type })
  if (upErr) { console.error('[inspection-intake/files] upload', upErr.message); return NextResponse.json({ error: 'שגיאה בהעלאת הקובץ' }, { status: 500 }) }

  // Re-read right before writing so a parallel customer upload isn't dropped
  const { data: fresh } = await auth.sb.from('car_inspections').select('intake_files').eq('id', auth.row.id).maybeSingle()
  const next = [...((fresh?.intake_files ?? []) as IntakeFile[]),
    { kind: 'office_doc' as const, path, name: (f.name || 'scan.pdf').slice(0, 120), type: f.type, uploaded_at: new Date().toISOString() }]
  const { error } = await auth.sb.from('car_inspections').update({ intake_files: next }).eq('id', auth.row.id)
  if (error) {
    await auth.sb.storage.from(INTAKE_BUCKET).remove([path])
    return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: next.length })
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizedRow(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const one = req.nextUrl.searchParams.get('path')
  if (one) {
    if (!auth.files.some(f => f.path === one)) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    await auth.sb.storage.from(INTAKE_BUCKET).remove([one])
    const next = auth.files.filter(f => f.path !== one)
    const { error } = await auth.sb.from('car_inspections').update({ intake_files: next }).eq('id', auth.row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: next.length })
  }
  if (auth.files.length) await auth.sb.storage.from(INTAKE_BUCKET).remove(auth.files.map(f => f.path))
  return NextResponse.json({ ok: true })
}
