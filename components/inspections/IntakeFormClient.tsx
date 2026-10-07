'use client'

import { useEffect, useState } from 'react'
import { fetchVehicleByPlate, type VehicleData } from '@/lib/utils/plateApi'
import { INTAKE_FILE_KINDS, INTAKE_FILE_RETENTION_DAYS, INTAKE_MAX_FILE_BYTES, type IntakeFileKind } from '@/lib/inspections/intake'

// Public pre-fill form for a purchase inspection — opened by the customer from the personal
// link the office sent. Details are posted first, then each document in its own request.

interface Business { name: string; phone: string | null; logo: string | null }

const emptyData = {
  first_name: '', last_name: '', owner_id: '', owner_phone: '', owner_address: '',
  plate: '', km: '', car_code: '',
}
type Data = typeof emptyData

/** Phone photos are often 5-10MB — shrink to a print-friendly JPEG before uploading. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // e.g. HEIC on a browser that can't decode it — send as-is
  }
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200'

export default function IntakeFormClient({ token }: { token: string }) {
  const [state, setState]       = useState<'loading' | 'notfound' | 'closed' | 'form' | 'done'>('loading')
  const [business, setBusiness] = useState<Business | null>(null)
  const [data, setData]         = useState<Data>(emptyData)
  const [uploaded, setUploaded] = useState<IntakeFileKind[]>([])
  const [files, setFiles]       = useState<Partial<Record<IntakeFileKind, File>>>({})
  const [vehicle, setVehicle]   = useState<VehicleData | null>(null)
  const [plateBusy, setPlateBusy] = useState(false)
  const [plateMsg, setPlateMsg] = useState('')
  const [errors, setErrors]     = useState<Set<keyof Data>>(new Set())
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState('')
  const [consent, setConsent]   = useState(false)
  const [consentErr, setConsentErr] = useState(false)

  useEffect(() => {
    fetch(`/api/public/inspection-intake/${token}`)
      .then(async r => {
        if (!r.ok) { setState('notfound'); return }
        const j = await r.json()
        setBusiness(j.business)
        if (j.closed) { setState('closed'); return }
        setData({ ...emptyData, ...j.data })
        setUploaded(j.uploaded ?? [])
        setState('form')
        if (j.data?.plate) lookupPlate(j.data.plate)
      })
      .catch(() => setState('notfound'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const set = (k: keyof Data, v: string) => {
    setData(d => ({ ...d, [k]: v }))
    if (errors.has(k)) setErrors(s => { const n = new Set(s); n.delete(k); return n })
  }

  async function lookupPlate(plate = data.plate) {
    const clean = plate.replace(/\D/g, '')
    if (clean.length < 5) return
    setPlateBusy(true); setPlateMsg('')
    const v = await fetchVehicleByPlate(clean)
    setVehicle(v)
    if (!v) setPlateMsg('לא נמצאו פרטים במאגר משרד התחבורה — בדוק את המספר')
    setPlateBusy(false)
  }

  function pickFile(kind: IntakeFileKind, f: File | undefined) {
    setError('')
    if (!f) return
    if (!/^(image\/|application\/pdf$)/.test(f.type)) { setError('ניתן להעלות רק תמונה או PDF'); return }
    if (f.type === 'application/pdf' && f.size > INTAKE_MAX_FILE_BYTES) { setError('קובץ PDF גדול מדי (עד 4MB) — אפשר לצלם תמונה במקום'); return }
    setFiles(m => ({ ...m, [kind]: f }))
  }

  async function submit() {
    setError('')
    const bad = new Set<keyof Data>()
    if (!data.first_name.trim()) bad.add('first_name')
    if (!data.last_name.trim()) bad.add('last_name')
    if (data.owner_id.replace(/\D/g, '').length < 5) bad.add('owner_id')
    if (data.owner_phone.replace(/\D/g, '').length < 9) bad.add('owner_phone')
    if (data.plate.replace(/\D/g, '').length < 5) bad.add('plate')
    if (bad.size) { setErrors(bad); setError('יש למלא את כל שדות החובה המסומנים'); return }
    if (!consent) { setConsentErr(true); setError('יש לאשר את השימוש בפרטים כדי לשלוח'); return }

    try {
      setBusy('שומר פרטים...')
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => fd.append(k, v))
      fd.append('consent', '1')
      let r = await fetch(`/api/public/inspection-intake/${token}`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'שגיאה בשמירה')

      const done = [...uploaded]
      for (const { kind, label } of INTAKE_FILE_KINDS) {
        const f = files[kind]
        if (!f) continue
        setBusy(`מעלה: ${label}...`)
        const small = await compressImage(f)
        if (small.size > INTAKE_MAX_FILE_BYTES) throw new Error(`הקובץ "${label}" גדול מדי — נסה לצלם שוב`)
        const ffd = new FormData()
        ffd.append('kind', kind)
        ffd.append('file', small)
        r = await fetch(`/api/public/inspection-intake/${token}`, { method: 'POST', body: ffd })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `שגיאה בהעלאת ${label}`)
        if (!done.includes(kind)) done.push(kind)
        setFiles(m => { const n = { ...m }; delete n[kind]; return n })
      }
      setUploaded(done)
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה — נסה שוב')
    } finally {
      setBusy('')
    }
  }

  const bringList = INTAKE_FILE_KINDS.filter(k => !uploaded.includes(k.kind))
  const header = (
    <div className="text-center mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {business?.logo && <img src={business.logo} alt="" className="mx-auto mb-3 max-h-16 object-contain" />}
      <div className="text-xl font-black text-slate-900">{business?.name}</div>
      <div className="text-slate-500 text-sm mt-1">טופס פרטים לבדיקת קנייה</div>
    </div>
  )

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-slate-500" dir="rtl">טוען...</div>
  }

  if (state === 'notfound' || state === 'closed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          {header}
          <div className="text-5xl mb-4">{state === 'closed' ? '✅' : '🔍'}</div>
          <p className="text-slate-600">{state === 'closed' ? 'הטופס הזה כבר טופל. תודה!' : 'הלינק לא תקין או שפג תוקפו.'}</p>
        </div>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          {header}
          <div className="text-5xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">הפרטים התקבלו, תודה!</h1>
          <p className="text-slate-500 text-sm">נתראה בבדיקה.</p>
          {bringList.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-right">
              <div className="font-bold text-amber-800 mb-1">📌 יש להביא איתך לבדיקה:</div>
              <ul className="list-disc pr-5 text-amber-900 text-sm space-y-0.5">
                {bringList.map(k => <li key={k.kind}>{k.bring}</li>)}
              </ul>
            </div>
          )}
          <button onClick={() => setState('form')} className="mt-5 text-sm text-emerald-700 underline">עריכת הפרטים</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4" dir="rtl">
      <div className="max-w-lg mx-auto">
        {header}

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4 space-y-4">
          <h2 className="font-bold text-lg text-slate-800">👤 פרטים אישיים</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם פרטי" required>
              <input className={inputCls + (errors.has('first_name') ? ' border-red-500' : '')} value={data.first_name} onChange={e => set('first_name', e.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="שם משפחה" required>
              <input className={inputCls + (errors.has('last_name') ? ' border-red-500' : '')} value={data.last_name} onChange={e => set('last_name', e.target.value)} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="תעודת זהות" required>
            <input className={inputCls + (errors.has('owner_id') ? ' border-red-500' : '')} value={data.owner_id} onChange={e => set('owner_id', e.target.value)} inputMode="numeric" dir="ltr" maxLength={9} />
          </Field>
          <Field label="טלפון" required>
            <input className={inputCls + (errors.has('owner_phone') ? ' border-red-500' : '')} value={data.owner_phone} onChange={e => set('owner_phone', e.target.value)} type="tel" inputMode="tel" dir="ltr" autoComplete="tel" />
          </Field>
          <Field label="כתובת">
            <input className={inputCls} value={data.owner_address} onChange={e => set('owner_address', e.target.value)} placeholder="רחוב, מספר, עיר" autoComplete="street-address" />
          </Field>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4 space-y-4">
          <h2 className="font-bold text-lg text-slate-800">🚗 פרטי הרכב</h2>
          <Field label="מספר רכב" required>
            <div className="flex gap-2">
              <input className={inputCls + ' font-mono font-bold tracking-wider' + (errors.has('plate') ? ' border-red-500' : '')}
                value={data.plate} onChange={e => { set('plate', e.target.value); setVehicle(null); setPlateMsg('') }}
                onBlur={() => lookupPlate()} inputMode="numeric" dir="ltr" placeholder="12-345-67" />
              <button type="button" onClick={() => lookupPlate()} disabled={plateBusy}
                className="shrink-0 rounded-xl bg-slate-800 px-4 text-white font-bold disabled:opacity-60">
                {plateBusy ? '...' : 'חפש'}
              </button>
            </div>
          </Field>
          {vehicle && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
              <div className="font-bold">{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</div>
              <div className="text-emerald-800">{[vehicle.year, vehicle.color].filter(Boolean).join(' · ')}</div>
            </div>
          )}
          {plateMsg && <div className="text-sm text-amber-700">{plateMsg}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label='קילומטראז׳'>
              <input className={inputCls} value={data.km} onChange={e => set('km', e.target.value)} inputMode="numeric" dir="ltr" />
            </Field>
            <Field label="קוד רכב (אם יש)">
              <input className={inputCls} value={data.car_code} onChange={e => set('car_code', e.target.value)} dir="ltr" />
            </Field>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4 space-y-3">
          <h2 className="font-bold text-lg text-slate-800">📎 מסמכים</h2>
          <p className="text-sm text-slate-500">לא חובה — מה שלא יועלה כאן יש להביא פיזית לבדיקה.</p>
          {INTAKE_FILE_KINDS.map(({ kind, label }) => {
            const picked = files[kind]
            const done = uploaded.includes(kind)
            return (
              <div key={kind} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">{label}</div>
                  <div className="text-xs truncate mt-0.5">
                    {picked ? <span className="text-emerald-700">✓ {picked.name}</span>
                      : done ? <span className="text-emerald-700">✓ הועלה</span>
                      : <span className="text-amber-700">לא הועלה — יש להביא בהגעה</span>}
                  </div>
                </div>
                <label className="shrink-0 cursor-pointer rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white active:bg-emerald-700">
                  {picked || done ? 'החלף' : '📷 צלם / בחר'}
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { pickFile(kind, e.target.files?.[0]); e.target.value = '' }} />
                </label>
              </div>
            )
          })}
        </section>

        <label className={`mb-4 flex items-start gap-3 rounded-xl border bg-white p-4 text-sm text-slate-700 ${consentErr ? 'border-red-500' : 'border-slate-200'}`}>
          <input type="checkbox" checked={consent} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
            onChange={e => { setConsent(e.target.checked); setConsentErr(false) }} />
          <span>
            אני מאשר/ת ל{business?.name || 'העסק'} לשמור את הפרטים והמסמכים שמסרתי לצורך ביצוע בדיקת הקנייה בלבד.
            צילומי המסמכים יימחקו {INTAKE_FILE_RETENTION_DAYS} יום לאחר הבדיקה.{' '}
            <a href="/privacy" target="_blank" className="text-emerald-700 underline">מדיניות הפרטיות</a>
            <span className="text-red-500"> *</span>
          </span>
        </label>

        {error && <div className="mb-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

        <button onClick={submit} disabled={!!busy}
          className="w-full rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow active:bg-emerald-700 disabled:opacity-70">
          {busy || 'שליחה'}
        </button>
        {business?.phone && (
          <p className="text-center text-sm text-slate-500 mt-4">
            שאלות? <a href={`tel:${business.phone}`} className="text-emerald-700 font-semibold" dir="ltr">{business.phone}</a>
          </p>
        )}
      </div>
    </div>
  )
}
