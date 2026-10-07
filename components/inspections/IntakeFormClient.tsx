'use client'

import { useEffect, useRef, useState } from 'react'
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

// NOTE: globals.css has an unlayered `* { margin:0; padding:0 }` reset that beats Tailwind v4's
// layered utilities, so spacing classes here carry the `!` (important) suffix.

// ── Design tokens (design A: clean, stepped) ──
const C = {
  accent: '#0b5c55', accentDark: '#073f3a', accentSoft: '#e8f3f1',
  text: '#15201e', muted: '#45524f', border: '#8a9794', card: '#dde3e1', bg: '#f4f6f5',
  error: '#b42318', errorBg: '#fff7f6',
}

const STEPS = ['פרטים אישיים', 'הרכב', 'מסמכים'] as const

function Field({ id, label, required, optional, error, children }: {
  id: string; label: string; required?: boolean; optional?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-bold" style={{ color: C.text }}>
        {label}
        {required && <span style={{ color: C.error }} aria-hidden="true"> *</span>}
        {optional && <span className="font-normal" style={{ color: C.muted }}> (לא חובה)</span>}
      </label>
      {children}
      {error && (
        <span id={`${id}-err`} role="alert" className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: C.error }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
          {error}
        </span>
      )}
    </div>
  )
}

const inputStyle = (bad: boolean): React.CSSProperties => ({
  height: 52, boxSizing: 'border-box', borderRadius: 12, padding: '0 14px', fontSize: 18, width: '100%',
  border: `2px solid ${bad ? C.error : C.border}`, background: bad ? C.errorBg : '#fff', color: C.text,
})
const inputCls = 'outline-none focus-visible:ring-4 focus-visible:ring-[#0b5c55]/30 focus-visible:!border-[#0b5c55] placeholder:text-[#6b7774]'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[18px] bg-white p-5!" style={{ border: `1px solid ${C.card}` }}>
      <h2 className="m-0 text-xl font-extrabold" style={{ color: C.text }}>{title}</h2>
      {children}
    </section>
  )
}

const CheckIcon = ({ color = C.accent, size = 22 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)
const DocIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h4M6 16h6" /></svg>
)

const ERR: Partial<Record<keyof Data, string>> = {
  first_name: 'יש להזין שם פרטי', last_name: 'יש להזין שם משפחה', owner_id: 'יש להזין מספר תעודת זהות',
  owner_phone: 'יש להזין מספר טלפון נייד', plate: 'יש להזין מספר רכב',
}

export default function IntakeFormClient({ token }: { token: string }) {
  const [state, setState]       = useState<'loading' | 'notfound' | 'closed' | 'form' | 'done'>('loading')
  const [step, setStep]         = useState(0)
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
  const topRef = useRef<HTMLDivElement>(null)
  // The fixed business link (QR) hands back a personal token after the first submit — uploads
  // and later edits go through that one.
  const activeToken = useRef(token)

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
    if (!v) setPlateMsg('לא נמצאו פרטים במאגר משרד התחבורה – כדאי לבדוק את המספר')
    setPlateBusy(false)
  }

  function pickFile(kind: IntakeFileKind, f: File | undefined) {
    setError('')
    if (!f) return
    if (!/^(image\/|application\/pdf$)/.test(f.type)) { setError('ניתן להעלות רק תמונה או קובץ PDF'); return }
    if (f.type === 'application/pdf' && f.size > INTAKE_MAX_FILE_BYTES) { setError('קובץ ה-PDF גדול מדי (עד 4MB) – אפשר לצלם תמונה במקום'); return }
    setFiles(m => ({ ...m, [kind]: f }))
  }

  function stepErrors(i: number): Set<keyof Data> {
    const bad = new Set<keyof Data>()
    if (i === 0) {
      if (!data.first_name.trim()) bad.add('first_name')
      if (!data.last_name.trim()) bad.add('last_name')
      if (data.owner_id.replace(/\D/g, '').length < 5) bad.add('owner_id')
      if (data.owner_phone.replace(/\D/g, '').length < 9) bad.add('owner_phone')
    }
    if (i === 1 && data.plate.replace(/\D/g, '').length < 5) bad.add('plate')
    return bad
  }

  function goTo(i: number) {
    setError('')
    // Moving forward requires the current step to be valid; going back never does.
    if (i > step) {
      const bad = stepErrors(step)
      if (bad.size) {
        setErrors(bad)
        document.getElementById(`f-${[...bad][0]}`)?.focus()
        return
      }
    }
    setStep(i)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function submit() {
    setError('')
    for (const i of [0, 1]) {
      const bad = stepErrors(i)
      if (bad.size) { setErrors(bad); setStep(i); return }
    }
    if (!consent) { setConsentErr(true); setError('יש לאשר את השימוש בפרטים כדי לשלוח'); return }

    try {
      setBusy('שומר פרטים...')
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => fd.append(k, v))
      fd.append('consent', '1')
      let r = await fetch(`/api/public/inspection-intake/${activeToken.current}`, { method: 'POST', body: fd })
      const saved = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(saved.error ?? 'שגיאה בשמירה')
      if (saved.token && saved.token !== activeToken.current) {
        activeToken.current = saved.token
        window.history.replaceState(null, '', `/intake/${saved.token}`)
      }

      const done = [...uploaded]
      for (const { kind, label } of INTAKE_FILE_KINDS) {
        const f = files[kind]
        if (!f) continue
        setBusy(`מעלה: ${label}...`)
        const small = await compressImage(f)
        if (small.size > INTAKE_MAX_FILE_BYTES) throw new Error(`הקובץ "${label}" גדול מדי – נסה לצלם שוב`)
        const ffd = new FormData()
        ffd.append('kind', kind)
        ffd.append('file', small)
        r = await fetch(`/api/public/inspection-intake/${activeToken.current}`, { method: 'POST', body: ffd })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `שגיאה בהעלאת ${label}`)
        if (!done.includes(kind)) done.push(kind)
        setFiles(m => { const n = { ...m }; delete n[kind]; return n })
      }
      setUploaded(done)
      setState('done')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה – נסה שוב')
    } finally {
      setBusy('')
    }
  }

  const fieldProps = (k: keyof Data) => ({
    id: `f-${k}`,
    value: data[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value),
    className: inputCls,
    style: inputStyle(errors.has(k)),
    'aria-invalid': errors.has(k) || undefined,
    'aria-describedby': errors.has(k) ? `f-${k}-err` : undefined,
  })
  const errOf = (k: keyof Data) => (errors.has(k) ? ERR[k] : undefined)

  const bringList = INTAKE_FILE_KINDS.filter(k => !uploaded.includes(k.kind))

  const header = (
    <header className="flex flex-col items-center gap-2.5 bg-white px-5! pb-5! pt-7!" style={{ borderBottom: `1px solid ${C.card}` }}>
      {business?.logo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={business.logo} alt="" className="max-h-14 object-contain" />
        : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: C.accent }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /><path d="m7.8 10.6 2 2 3.7-3.8" /></svg>
          </div>
        )}
      {business?.name && <div className="text-[22px] font-extrabold" style={{ color: C.text }}>{business.name}</div>}
      <div className="text-[17px]" style={{ color: C.muted }}>טופס פרטים לבדיקת קנייה</div>
    </header>
  )

  const shell = (children: React.ReactNode) => (
    <div dir="rtl" className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <div className="mx-auto! max-w-lg" ref={topRef}>
        {header}
        {children}
      </div>
    </div>
  )

  if (state === 'loading') {
    return <div dir="rtl" role="status" className="flex min-h-screen items-center justify-center text-lg" style={{ background: C.bg, color: C.muted }}>טוען...</div>
  }

  if (state === 'notfound' || state === 'closed') {
    return shell(
      <main className="p-5!">
        <div className="flex flex-col items-center gap-3 rounded-[18px] bg-white p-8! text-center" style={{ border: `1px solid ${C.card}` }}>
          {state === 'closed' && <CheckIcon size={44} />}
          <p className="m-0 text-lg" style={{ color: C.text }}>
            {state === 'closed' ? 'הטופס הזה כבר טופל. תודה!' : 'הלינק לא תקין או שפג תוקפו. אפשר לפנות לעסק לקבלת לינק חדש.'}
          </p>
        </div>
      </main>
    )
  }

  if (state === 'done') {
    return shell(
      <main className="flex flex-col gap-4 p-5!">
        <section className="flex flex-col items-center gap-3 rounded-[18px] bg-white p-7! text-center" style={{ border: `1px solid ${C.card}` }}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: C.accentSoft }}><CheckIcon size={34} /></div>
          <h1 className="m-0 text-2xl font-extrabold">הפרטים התקבלו, תודה!</h1>
          <p className="m-0 text-[17px]" style={{ color: C.muted }}>נתראה בבדיקה.</p>
        </section>
        {bringList.length > 0 && (
          <section className="rounded-[18px] p-5!" style={{ background: '#fff4e0', border: '1px solid #f1c27d' }}>
            <h2 className="m-0 mb-2! text-lg font-extrabold" style={{ color: '#5c2408' }}>יש להביא איתך לבדיקה:</h2>
            <ul className="m-0 flex list-disc flex-col gap-1 pr-5! text-[17px]" style={{ color: '#5c2408' }}>
              {bringList.map(k => <li key={k.kind}>{k.bring}</li>)}
            </ul>
          </section>
        )}
        <button onClick={() => { setStep(0); setState('form') }}
          className="h-12 rounded-xl bg-white text-base font-bold" style={{ border: `2px solid ${C.border}`, color: C.text }}>
          עריכת הפרטים
        </button>
      </main>
    )
  }

  return shell(
    <>
      <nav aria-label="שלבי הטופס" className="flex gap-2 px-5! pb-1.5! pt-[18px]!">
        {STEPS.map((label, i) => (
          <button key={label} type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}
            className="flex flex-1 flex-col gap-1.5 bg-transparent p-0 text-right">
            <span className="h-1.5 w-full rounded-full" style={{ background: i <= step ? C.accent : '#c9d2cf' }} />
            <span className="text-sm" style={{ fontWeight: i === step ? 700 : 600, color: i === step ? C.text : C.muted }}>{i + 1}. {label}</span>
          </button>
        ))}
      </nav>

      <main className="flex flex-col gap-4 px-5! pb-8! pt-3.5!">
        {step === 0 && (
          <Card title="פרטים אישיים">
            <div className="grid grid-cols-2 gap-3">
              <Field id="f-first_name" label="שם פרטי" required error={errOf('first_name')}>
                <input {...fieldProps('first_name')} autoComplete="given-name" />
              </Field>
              <Field id="f-last_name" label="שם משפחה" required error={errOf('last_name')}>
                <input {...fieldProps('last_name')} autoComplete="family-name" />
              </Field>
            </div>
            <Field id="f-owner_id" label="תעודת זהות" required error={errOf('owner_id')}>
              <input {...fieldProps('owner_id')} inputMode="numeric" maxLength={9} placeholder="9 ספרות" dir="ltr" style={{ ...inputStyle(errors.has('owner_id')), textAlign: 'right' }} />
            </Field>
            <Field id="f-owner_phone" label="טלפון נייד" required error={errOf('owner_phone')}>
              <input {...fieldProps('owner_phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="050-0000000" dir="ltr" style={{ ...inputStyle(errors.has('owner_phone')), textAlign: 'right' }} />
            </Field>
            <Field id="f-owner_address" label="כתובת" optional>
              <input {...fieldProps('owner_address')} autoComplete="street-address" placeholder="רחוב, מספר, עיר" />
            </Field>
          </Card>
        )}

        {step === 1 && (
          <Card title="פרטי הרכב">
            <Field id="f-plate" label="מספר רכב" required error={errOf('plate')}>
              <div dir="ltr" className="flex h-[60px] overflow-hidden rounded-xl focus-within:ring-4 focus-within:ring-[#0b5c55]/30"
                style={{ border: `2px solid ${errors.has('plate') ? C.error : C.text}`, background: '#f7c600' }}>
                <div className="flex w-[38px] items-center justify-center text-[11px] font-extrabold text-white" style={{ background: '#1d4ed8' }} aria-hidden="true">IL</div>
                <input id="f-plate" value={data.plate} inputMode="numeric" placeholder="12-345-67"
                  onChange={e => { set('plate', e.target.value); setVehicle(null); setPlateMsg('') }}
                  onBlur={() => lookupPlate()}
                  aria-invalid={errors.has('plate') || undefined} aria-describedby={errors.has('plate') ? 'f-plate-err' : 'plate-result'}
                  className="min-w-0 flex-1 border-0 bg-transparent text-center text-[28px] font-extrabold tracking-[3px] outline-none placeholder:text-[#7a6a1a]"
                  style={{ color: C.text }} />
              </div>
            </Field>
            <div id="plate-result" aria-live="polite">
              {plateBusy && <div className="text-base" style={{ color: C.muted }}>מחפש במאגר משרד התחבורה...</div>}
              {vehicle && (
                <div className="flex items-center gap-3 rounded-xl px-3.5! py-3!" style={{ background: C.accentSoft }}>
                  <CheckIcon />
                  <div className="flex flex-col">
                    <span className="text-[17px] font-extrabold" style={{ color: '#0b3b36' }}>{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</span>
                    <span className="text-[15px]" style={{ color: '#26514c' }}>{[vehicle.year, vehicle.color, 'נמצא במאגר משרד התחבורה'].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
              )}
              {plateMsg && <div className="text-base font-semibold" style={{ color: '#8a4b00' }}>{plateMsg}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="f-km" label="קילומטראז׳">
                <input {...fieldProps('km')} inputMode="numeric" placeholder="לדוגמה 85000" dir="ltr" style={{ ...inputStyle(false), textAlign: 'right' }} />
              </Field>
              <Field id="f-car_code" label="קוד רכב">
                <input {...fieldProps('car_code')} placeholder="אם יש" dir="ltr" style={{ ...inputStyle(false), textAlign: 'right' }} />
              </Field>
            </div>
          </Card>
        )}

        {step === 2 && (
          <>
            <Card title="מסמכים">
              <p className="m-0 text-base leading-relaxed" style={{ color: C.muted }}>לא חובה. מה שלא תעלה כאן – יש להביא איתך לבדיקה.</p>
              {INTAKE_FILE_KINDS.map(({ kind, label, hint }) => {
                const picked = files[kind]
                const has = !!picked || uploaded.includes(kind)
                return (
                  <div key={kind} className="flex items-center gap-3 rounded-[14px] p-3!"
                    style={has ? { border: `2px solid ${C.accent}`, background: '#f0f8f6' } : { border: `2px dashed ${C.border}` }}>
                    <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: has ? '#cfe3df' : '#eef1f0' }}>
                      {has ? <CheckIcon size={26} /> : <DocIcon />}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[17px] font-extrabold">{label}</span>
                      <span className="truncate text-[15px]" style={{ color: has ? '#26514c' : C.muted }}>
                        {picked ? picked.name : has ? 'הועלה' : hint}
                      </span>
                    </div>
                    <label className="flex h-11 shrink-0 cursor-pointer items-center rounded-[10px] px-3.5! text-base font-bold focus-within:ring-4 focus-within:ring-[#0b5c55]/30"
                      style={has ? { border: `2px solid ${C.border}`, background: '#fff', color: C.text } : { background: C.accent, color: '#fff' }}>
                      {has ? 'החלף' : 'צלם / בחר'}
                      <input type="file" accept="image/*,application/pdf" className="sr-only" aria-label={`${has ? 'החלפת' : 'העלאת'} ${label}`}
                        onChange={e => { pickFile(kind, e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                  </div>
                )
              })}
            </Card>

            <label className="flex items-start gap-3 rounded-[14px] bg-white p-4! text-base leading-relaxed"
              style={{ border: `${consentErr ? 2 : 1}px solid ${consentErr ? C.error : C.card}` }}>
              <input type="checkbox" checked={consent} className="mt-0.5! h-6 w-6 shrink-0" style={{ accentColor: C.accent }}
                onChange={e => { setConsent(e.target.checked); setConsentErr(false) }} />
              <span>
                אני מאשר/ת ל{business?.name || 'העסק'} לשמור את הפרטים והמסמכים לצורך בדיקת הקנייה בלבד.
                צילומי המסמכים יימחקו {INTAKE_FILE_RETENTION_DAYS} יום לאחר הבדיקה.{' '}
                <a href="/privacy" target="_blank" className="font-semibold underline" style={{ color: C.accent }}>מדיניות הפרטיות</a>
              </span>
            </label>
          </>
        )}

        {error && <div role="alert" className="rounded-xl p-3! text-base font-semibold" style={{ background: C.errorBg, border: `1px solid ${C.error}`, color: C.error }}>{error}</div>}

        <div className="flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => goTo(step - 1)} disabled={!!busy}
              className="h-[60px] rounded-2xl bg-white px-5! text-lg font-bold" style={{ border: `2px solid ${C.border}`, color: C.text }}>
              חזרה
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => goTo(step + 1)}
              className="h-[60px] flex-1 rounded-2xl text-xl font-extrabold text-white" style={{ background: C.accent }}>
              המשך
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!!busy} aria-busy={!!busy}
              className="h-[60px] flex-1 rounded-2xl text-xl font-extrabold text-white disabled:opacity-80" style={{ background: busy ? C.accentDark : C.accent }}>
              {busy || 'שליחת הפרטים'}
            </button>
          )}
        </div>

        {business?.phone && (
          <p className="m-0 text-center text-base" style={{ color: C.muted }}>
            שאלות? <a href={`tel:${business.phone}`} dir="ltr" className="font-semibold" style={{ color: C.accent }}>{business.phone}</a>
          </p>
        )}
      </main>
    </>
  )
}
