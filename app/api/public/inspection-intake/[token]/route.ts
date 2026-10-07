import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'
import {
  INTAKE_BUCKET, INTAKE_FILE_KINDS, INTAKE_MAX_FILE_BYTES, newIntakeToken,
  type IntakeFile, type IntakeFileKind,
} from '@/lib/inspections/intake'

// Public endpoint behind the pre-fill links. Two kinds of token share the same URL shape:
//   • personal – car_inspections.intake_token: one inspection; the row must still be waiting for
//     the customer (link_sent / submitted) — once the customer arrived the link is dead.
//   • business – tenants.intake_public_token (the fixed link / QR): submitting details creates a
//     new inspection and returns its personal token, used from then on for uploads and edits.

const OPEN_STATUSES = ['link_sent', 'submitted']
const ALLOWED_TYPES = /^(image\/|application\/pdf$)/

// Abuse guards for the fixed business link, which anyone holding the QR can submit.
const QR_MAX_PER_HOUR = 30

async function loadTenantByPublicToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const sb = createServiceClient()
  const { data } = await sb.from('tenants').select('id').eq('intake_public_token', token).maybeSingle()
  return data
}

async function loadBusiness(tenantId: string) {
  const sb = createServiceClient()
  const { data: tenant } = await sb.from('tenants').select('name, phone, logo_base64').eq('id', tenantId).maybeSingle()
  return { name: tenant?.name ?? '', phone: tenant?.phone ?? null, logo: tenant?.logo_base64 ?? null }
}

async function loadRow(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const sb = createServiceClient()
  const { data } = await sb
    .from('car_inspections')
    .select('id, tenant_id, intake_status, intake_files, owner_name, owner_id, owner_phone, owner_address, plate, km, car_code')
    .eq('intake_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await loadRow(token)
  if (!row) {
    const tenant = await loadTenantByPublicToken(token)
    if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ closed: false, business: await loadBusiness(tenant.id), submitted: false, data: {}, uploaded: [] })
  }

  const business = await loadBusiness(row.tenant_id)

  if (!OPEN_STATUSES.includes(row.intake_status ?? '')) {
    return NextResponse.json({ closed: true, business })
  }

  // Split the stored full name back so a returning customer can fix what they sent.
  const [first = '', ...rest] = (row.owner_name ?? '').trim().split(/\s+/)
  return NextResponse.json({
    closed: false,
    business,
    submitted: row.intake_status === 'submitted',
    data: {
      first_name: first, last_name: rest.join(' '),
      owner_id: row.owner_id ?? '', owner_phone: row.owner_phone ?? '', owner_address: row.owner_address ?? '',
      plate: row.plate ?? '', km: row.km ?? '', car_code: row.car_code ?? '',
    },
    uploaded: ((row.intake_files ?? []) as IntakeFile[]).map(f => f.kind),
  })
}

// Two request shapes (each file goes in its own request — Vercel caps a request body at ~4.5MB):
//   • details:  first_name, last_name, owner_id, owner_phone, owner_address, plate, km, car_code
//   • one file: kind + file   (only after details were saved — that's where consent is recorded)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await loadRow(token)
  const publicTenant = row ? null : await loadTenantByPublicToken(token)
  if (!row && !publicTenant) return NextResponse.json({ error: 'הלינק לא נמצא' }, { status: 404 })
  if (row && !OPEN_STATUSES.includes(row.intake_status ?? '')) {
    return NextResponse.json({ error: 'הטופס כבר נסגר' }, { status: 410 })
  }

  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const sb = createServiceClient()

  // ── Single document upload ──
  if (fd.has('kind')) {
    if (!row) return NextResponse.json({ error: 'יש לשלוח קודם את הפרטים' }, { status: 400 })
    const kind = String(fd.get('kind')) as IntakeFileKind
    const f    = fd.get('file')
    if (row.intake_status !== 'submitted') return NextResponse.json({ error: 'יש לשלוח קודם את הפרטים' }, { status: 400 })
    if (!INTAKE_FILE_KINDS.some(k => k.kind === kind)) return NextResponse.json({ error: 'סוג מסמך לא תקין' }, { status: 400 })
    if (!(f instanceof File) || f.size === 0) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
    if (f.size > INTAKE_MAX_FILE_BYTES) return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 })
    if (!ALLOWED_TYPES.test(f.type)) return NextResponse.json({ error: 'ניתן להעלות רק תמונה או PDF' }, { status: 400 })

    const ext  = f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '').slice(0, 5)
    const path = `${row.tenant_id}/${row.id}/${kind}-${Date.now()}.${ext}`
    const { error: upErr } = await sb.storage.from(INTAKE_BUCKET).upload(path, f, { contentType: f.type })
    if (upErr) {
      console.error('intake upload failed:', upErr)
      return NextResponse.json({ error: 'שגיאה בהעלאת הקובץ — נסה שוב' }, { status: 500 })
    }

    // Re-read right before writing so two parallel uploads can't drop each other's entry,
    // and a re-upload of the same document replaces (and deletes) the previous one.
    const fresh = await loadRow(token)
    const files = ((fresh?.intake_files ?? []) as IntakeFile[])
    const old   = files.filter(x => x.kind === kind)
    const next  = [...files.filter(x => x.kind !== kind),
      { kind, path, name: f.name.slice(0, 120), type: f.type, uploaded_at: new Date().toISOString() }]
    const { error } = await sb.from('car_inspections').update({ intake_files: next }).eq('id', row.id)
    if (error) {
      await sb.storage.from(INTAKE_BUCKET).remove([path])
      return NextResponse.json({ error: 'שגיאה בשמירה — נסה שוב' }, { status: 500 })
    }
    if (old.length) await sb.storage.from(INTAKE_BUCKET).remove(old.map(o => o.path))
    return NextResponse.json({ ok: true })
  }

  // ── Details ──
  const str = (k: string, max = 120) => String(fd.get(k) ?? '').trim().slice(0, max)
  const first   = str('first_name')
  const last    = str('last_name')
  const ownerId = str('owner_id', 12).replace(/\D/g, '')
  const phone   = str('owner_phone', 20).replace(/[^\d+]/g, '')
  const address = str('owner_address', 200)
  const plate   = str('plate', 12).replace(/\D/g, '')
  const km      = str('km', 9).replace(/\D/g, '')
  const carCode = str('car_code', 30)

  if (fd.get('consent') !== '1') {
    return NextResponse.json({ error: 'יש לאשר את מדיניות הפרטיות' }, { status: 400 })
  }

  const missing: string[] = []
  if (!first || !last)     missing.push('שם מלא')
  if (ownerId.length < 5)  missing.push('תעודת זהות')
  if (phone.length < 9)    missing.push('טלפון')
  if (plate.length < 5)    missing.push('מספר רכב')
  if (missing.length) return NextResponse.json({ error: `שדות חובה חסרים: ${missing.join(', ')}` }, { status: 400 })

  const vehicle = await fetchVehicleByPlate(plate)

  const details = {
    owner_name:    `${first} ${last}`,
    owner_id:      ownerId,
    owner_phone:   phone,
    owner_address: address || null,
    plate,
    km:            km || null,
    car_code:      carCode || null,
    make:          vehicle?.make    ?? null,
    model:         vehicle?.model   ?? null,
    year:          vehicle?.year    ?? null,
    color:         vehicle?.color   ?? null,
    chassis:       vehicle?.chassis ?? null,
    intake_status: 'submitted',
    intake_submitted_at: new Date().toISOString(),
    intake_consent_at:   new Date().toISOString(),
  }

  // ── Personal link: update its inspection ──
  if (row) {
    const { error } = await sb.from('car_inspections').update(details).eq('id', row.id)
    if (error) {
      console.error('intake submit failed:', error)
      return NextResponse.json({ error: 'שגיאה בשמירה — נסה שוב' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Fixed business link: create a new inspection (or reuse this customer's pending one) ──
  const tenantId = publicTenant!.id
  const { data: existing } = await sb.from('car_inspections')
    .select('id, intake_token')
    .eq('tenant_id', tenantId).eq('intake_status', 'submitted')
    .eq('owner_phone', phone).eq('plate', plate)
    .limit(1).maybeSingle()
  if (existing?.intake_token) {
    const { error } = await sb.from('car_inspections').update(details).eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'שגיאה בשמירה — נסה שוב' }, { status: 500 })
    return NextResponse.json({ ok: true, token: existing.intake_token })
  }

  const { count } = await sb.from('car_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('intake_source', 'qr')
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
  if ((count ?? 0) >= QR_MAX_PER_HOUR) {
    return NextResponse.json({ error: 'יותר מדי פניות כרגע – נסה שוב מאוחר יותר או צור קשר עם העסק' }, { status: 429 })
  }

  const personal = newIntakeToken()
  const { error } = await sb.from('car_inspections').insert({
    ...details, tenant_id: tenantId, status: 'draft', intake_source: 'qr', intake_token: personal,
  })
  if (error) {
    console.error('intake qr create failed:', error)
    return NextResponse.json({ error: 'שגיאה בשמירה — נסה שוב' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, token: personal })
}
