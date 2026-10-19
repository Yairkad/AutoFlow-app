'use client'

// Car sale contract editor — full-screen, edited directly on the document (no side form).
// Opened from Documents → חוזי מכירה and from a car's detail view (prefilled from the car).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'
import {
  type ContractData, type ContractParty, type ContractClause, type MyDetails, type PaymentMethod,
  DEFAULT_CLAUSES, newContract, cloneClauses, visibleClauses, itemLetter, priceToWords,
  parseAmount, fmtAmount, contractHtml,
} from '@/lib/cars/saleContract'

export interface ContractPrefill {
  car?: Partial<ContractData['car']>
  buyer?: Partial<ContractParty>
  price?: string
}

interface Props {
  open: boolean
  contractId?: string | null
  carId?: string | null
  prefill?: ContractPrefill
  onClose: () => void
  onSaved?: () => void
}

// ── Inline building blocks ───────────────────────────────────────────────────

function F({ value, onChange, placeholder, min = 10, bold, ltr, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
  min?: number; bold?: boolean; ltr?: boolean; type?: 'text' | 'date' | 'tel'
}) {
  const width = type === 'date' ? '9.5em' : `${Math.max(min, value.length + 2)}ch`
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="csc-f"
      style={{ width, maxWidth: '100%', fontWeight: bold ? 700 : 500, direction: ltr ? 'ltr' : undefined, textAlign: ltr ? 'right' : undefined }}
    />
  )
}

function AutoText({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return (
    <textarea
      ref={ref} rows={1} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="csc-t" style={{ fontWeight: bold ? 700 : 400 }}
    />
  )
}

const iconBtn: React.CSSProperties = {
  border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 5px',
  color: 'var(--text-muted)', fontFamily: 'inherit', borderRadius: 6,
}

// ── Editor ──────────────────────────────────────────────────────────────────

export default function CarContractEditor({ open, contractId, carId, prefill, onClose, onSaved }: Props) {
  const sb = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const [d, setD]               = useState<ContractData | null>(null)
  const [id, setId]             = useState<string | null>(null)
  const [linkedCar, setLinkedCar] = useState<string | null>(null)
  const [status, setStatus]     = useState<'draft' | 'signed'>('draft')
  const [myDetails, setMyDetails] = useState<MyDetails | null>(null)
  const [defClauses, setDefClauses] = useState<ContractClause[] | null>(null)
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [plateBusy, setPlateBusy] = useState(false)

  // Load settings + the contract (or a fresh one) whenever the editor opens
  useEffect(() => {
    if (!open || !profile?.tenantId) return
    let cancelled = false
    setD(null); setDirty(false)
    ;(async () => {
      const { data: s } = await sb.from('car_contract_settings')
        .select('seller, clauses').eq('tenant_id', profile.tenantId).maybeSingle()
      const mine = (s?.seller as MyDetails | null) ?? null
      const clauses = (s?.clauses as ContractClause[] | null) ?? null
      if (cancelled) return
      setMyDetails(mine); setDefClauses(clauses)

      if (contractId) {
        const { data: row, error } = await sb.from('car_sale_contracts').select('*').eq('id', contractId).single()
        if (cancelled) return
        if (error || !row) { showToast('שגיאה בטעינת החוזה', 'error'); onClose(); return }
        setId(row.id); setLinkedCar(row.car_id); setStatus(row.status)
        setD({ ...newContract(), ...(row.data as ContractData) })
      } else {
        setId(null); setLinkedCar(carId ?? null); setStatus('draft')
        setD(newContract({ myDetails: mine, clauses, ...prefill }))
      }
    })()
    return () => { cancelled = true }
    // prefill is a fresh object per render of the parent — only react to open/contract changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contractId, carId, profile?.tenantId])

  if (!open || typeof document === 'undefined') return null

  function patch(fn: (x: ContractData) => ContractData) {
    setD(prev => prev && fn(prev))
    setDirty(true)
  }
  const setParty = (side: 'seller' | 'buyer', k: keyof ContractParty, v: string) =>
    patch(x => ({ ...x, [side]: { ...x[side], [k]: v } }))
  const setCar = (k: keyof ContractData['car'], v: string) => patch(x => ({ ...x, car: { ...x.car, [k]: v } }))
  const setClauses = (fn: (c: ContractClause[]) => ContractClause[]) => patch(x => ({ ...x, clauses: fn(x.clauses) }))

  // ── Quick-fill ──
  function fillMine(side: 'seller' | 'buyer') {
    if (!myDetails) { showToast('עדיין לא נשמרו פרטים — מלא אותם ולחץ "שמור כפרטים שלי"', 'info'); return }
    patch(x => ({
      ...x,
      [side]: { name: myDetails.name, idNum: myDetails.idNum, phone: myDetails.phone, address: myDetails.address },
      location: x.location || myDetails.location,
    }))
  }

  async function saveMine(side: 'seller' | 'buyer') {
    if (!d || !profile) return
    const p = d[side]
    if (!p.name.trim()) { showToast('יש למלא שם לפני השמירה', 'error'); return }
    const mine: MyDetails = { ...p, location: d.location }
    const { error } = await sb.from('car_contract_settings')
      .upsert({ tenant_id: profile.tenantId, seller: mine, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    setMyDetails(mine)
    showToast('הפרטים שלך נשמרו למילוי מהיר', 'success')
  }

  // ── Clause wording defaults ──
  async function saveDefaultClauses() {
    if (!d || !profile) return
    const ok = await confirm({ msg: 'לשמור את נוסח הסעיפים הנוכחי כברירת מחדל לכל החוזים החדשים?', confirmLabel: 'שמור', variant: 'primary' })
    if (!ok) return
    const clauses = cloneClauses(d.clauses)
    const { error } = await sb.from('car_contract_settings')
      .upsert({ tenant_id: profile.tenantId, clauses, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    setDefClauses(clauses)
    showToast('הנוסח נשמר כברירת מחדל', 'success')
  }

  async function resetClauses(to: 'default' | 'original') {
    const ok = await confirm({ msg: to === 'default' ? 'להחליף את הסעיפים בחוזה הזה בנוסח ברירת המחדל שלך?' : 'להחזיר את הסעיפים לנוסח המקורי של המערכת?', confirmLabel: 'החלף', variant: 'danger' })
    if (!ok) return
    setClauses(() => cloneClauses(to === 'default' && defClauses?.length ? defClauses : DEFAULT_CLAUSES))
  }

  // ── Car lookup ──
  async function lookupPlate() {
    if (!d) return
    setPlateBusy(true)
    const v = await fetchVehicleByPlate(d.car.plate)
    setPlateBusy(false)
    if (!v) { showToast('הרכב לא נמצא במאגר משרד התחבורה', 'error'); return }
    patch(x => ({ ...x, car: {
      ...x.car,
      model: [v.make, v.model].filter(Boolean).join(' ') || x.car.model,
      year:  v.year ? String(v.year) : x.car.year,
      vin:   v.chassis || x.car.vin,
    } }))
    showToast('פרטי הרכב נמשכו בהצלחה', 'success')
  }

  // ── Price / checks ──
  function setPrice(v: string) {
    patch(x => ({ ...x, price: v, priceWords: x.priceWordsManual ? x.priceWords : priceToWords(v) }))
  }

  function splitChecks() {
    if (!d) return
    const total = parseAmount(d.price)
    if (!total) { showToast('יש למלא סכום כולל קודם', 'error'); return }
    const n = d.checks.length
    const base = Math.floor(total / n)
    const first = d.checks[0]?.date ? new Date(d.checks[0].date) : new Date()
    patch(x => ({ ...x, checks: x.checks.map((c, i) => {
      const dt = new Date(first.getFullYear(), first.getMonth() + i, first.getDate())
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      // the last check absorbs the rounding remainder
      const amount = i === n - 1 ? total - base * (n - 1) : base
      return { ...c, amount: fmtAmount(amount), date: iso }
    }) }))
  }

  // ── Save / print / close ──
  async function save(nextStatus = status): Promise<boolean> {
    if (!d || !profile) return false
    setSaving(true)
    const row = {
      tenant_id:     profile.tenantId,
      car_id:        linkedCar,
      plate:         d.car.plate.trim() || null,
      car_desc:      [d.car.model, d.car.year].filter(s => s.trim()).join(' ') || null,
      seller_name:   d.seller.name.trim() || null,
      buyer_name:    d.buyer.name.trim() || null,
      contract_date: d.date || null,
      total_price:   d.price.trim() || null,
      status:        nextStatus,
      data:          d,
      updated_at:    new Date().toISOString(),
    }
    const res = id
      ? await sb.from('car_sale_contracts').update(row).eq('id', id).select('id').single()
      : await sb.from('car_sale_contracts').insert({ ...row, created_by: profile.userId, created_by_name: profile.fullName }).select('id').single()
    setSaving(false)
    if (res.error || !res.data) { showToast('שגיאה בשמירת החוזה', 'error'); return false }
    setId(res.data.id); setStatus(nextStatus); setDirty(false)
    onSaved?.()
    return true
  }

  async function handleSave() {
    if (await save()) showToast('החוזה נשמר', 'success')
  }

  async function toggleSigned() {
    const next = status === 'signed' ? 'draft' : 'signed'
    if (await save(next)) showToast(next === 'signed' ? 'החוזה סומן כנחתם' : 'החוזה הוחזר לטיוטה', 'success')
  }

  async function handlePrint() {
    if (!d) return
    // open the window synchronously (popup blockers), fill it after saving
    const w = window.open('', '_blank')
    if (!w) { showToast('יש לאפשר חלונות קופצים בדפדפן', 'error'); return }
    if (dirty || !id) await save()
    w.document.write(contractHtml(d))
    w.document.close()
  }

  async function handleClose() {
    if (dirty) {
      const ok = await confirm({ msg: 'יש שינויים שלא נשמרו. לצאת בלי לשמור?', confirmLabel: 'צא בלי לשמור', variant: 'danger' })
      if (!ok) return
    }
    onClose()
  }

  // ── Render ──
  const clauses = d ? visibleClauses(d) : []
  // payment clause is always #3 → clauses after the first two shift by one
  const numOf = (visIdx: number) => visIdx < 2 ? visIdx + 1 : visIdx + 2

  const party = (side: 'seller' | 'buyer', label: string) => {
    const p = d![side]
    return (
      <div className="csc-party">
        <div className="csc-party-h">
          <span>{label}</span>
          <span className="csc-tools">
            <button type="button" className="csc-chip" onClick={() => fillMine(side)}>👤 הפרטים שלי</button>
            <button type="button" className="csc-chip csc-chip-ghost" onClick={() => saveMine(side)} title="שמור את הפרטים בצד הזה כפרטים שלך">💾 שמור כפרטים שלי</button>
          </span>
        </div>
        <div className="csc-grid">
          <div><b>שם:</b> <F value={p.name} onChange={v => setParty(side, 'name', v)} placeholder="שם מלא" min={16} bold /></div>
          <div><b>ת.ז:</b> <F value={p.idNum} onChange={v => setParty(side, 'idNum', v)} placeholder="מספר זהות" min={11} ltr /></div>
          <div><b>כתובת:</b> <F value={p.address} onChange={v => setParty(side, 'address', v)} placeholder="כתובת מלאה" min={20} /></div>
          <div><b>טלפון:</b> <F value={p.phone} onChange={v => setParty(side, 'phone', v)} placeholder="טלפון" min={12} ltr type="tel" /></div>
        </div>
      </div>
    )
  }

  const clauseBlock = (c: ContractClause, visIdx: number) => {
    const idx = d!.clauses.findIndex(x => x.id === c.id)
    const move = (dir: -1 | 1) => setClauses(list => {
      const j = idx + dir
      if (j < 0 || j >= list.length) return list
      const copy = [...list];[copy[idx], copy[j]] = [copy[j], copy[idx]]
      return copy
    })
    const setItem = (i: number, v: string) => setClauses(list => list.map(x => x.id === c.id ? { ...x, items: x.items.map((t, k) => k === i ? v : t) } : x))
    return (
      <div key={c.id} className="csc-clause">
        <div className="csc-clause-h">
          <span className="csc-num">{numOf(visIdx)}.</span>
          <div style={{ flex: 1 }}>
            <AutoText value={c.title} onChange={v => setClauses(list => list.map(x => x.id === c.id ? { ...x, title: v } : x))} placeholder="כותרת הסעיף" bold />
          </div>
          <span className="csc-tools">
            {c.kind === 'checks' && <span className="csc-hint">מופיע רק בתשלום בשיקים</span>}
            <button type="button" style={iconBtn} onClick={() => move(-1)} title="הזז למעלה" aria-label="הזז למעלה">▲</button>
            <button type="button" style={iconBtn} onClick={() => move(1)} title="הזז למטה" aria-label="הזז למטה">▼</button>
            <button type="button" style={{ ...iconBtn, color: 'var(--danger)' }} title="מחק סעיף" aria-label="מחק סעיף"
              onClick={async () => { if (await confirm({ msg: `למחוק את הסעיף "${c.title}"?`, variant: 'danger' })) setClauses(list => list.filter(x => x.id !== c.id)) }}>🗑</button>
          </span>
        </div>
        {c.items.map((t, i) => (
          <div key={i} className="csc-item">
            <span className="csc-letter">{itemLetter(i)}.</span>
            <div style={{ flex: 1 }}><AutoText value={t} onChange={v => setItem(i, v)} placeholder="נוסח הסעיף" /></div>
            <button type="button" className="csc-tools" style={{ ...iconBtn, color: 'var(--danger)' }} aria-label="מחק סעיף משנה"
              onClick={() => setClauses(list => list.map(x => x.id === c.id ? { ...x, items: x.items.filter((_, k) => k !== i) } : x))}>✕</button>
          </div>
        ))}
        <button type="button" className="csc-add csc-add-sub" onClick={() => setClauses(list => list.map(x => x.id === c.id ? { ...x, items: [...x.items, ''] } : x))}>+ סעיף משנה</button>
      </div>
    )
  }

  const paymentBlock = d && (
    <div className="csc-clause" key="payment">
      <div className="csc-clause-h"><span className="csc-num">3.</span><b style={{ fontSize: 15 }}>התמורה ואופן התשלום</b></div>
      <p className="csc-p">
        תמורת הרכב ישלם הקונה למוכר סך כולל של <F value={d.price} onChange={setPrice} placeholder="סכום" min={9} bold /> ש&quot;ח
        {' '}(במילים: <F value={d.priceWords} onChange={v => patch(x => ({ ...x, priceWords: v, priceWordsManual: true }))} placeholder="הסכום במילים" min={28} /> שקלים חדשים)
        {d.priceWordsManual && (
          <button type="button" style={iconBtn} title="חשב מחדש מהסכום" onClick={() => patch(x => ({ ...x, priceWords: priceToWords(x.price), priceWordsManual: false }))}>↻</button>
        )}
      </p>
      <div className="csc-seg">
        {([['checks', 'שיקים'], ['cash', 'מזומן'], ['transfer', 'העברה בנקאית']] as [PaymentMethod, string][]).map(([k, l]) => (
          <button key={k} type="button" className={d.payment === k ? 'on' : ''} onClick={() => patch(x => ({ ...x, payment: k }))}>{l}</button>
        ))}
      </div>
      {d.payment === 'checks' ? (
        <div className="csc-p">
          <div style={{ marginBottom: 6 }}>התשלום יבוצע באמצעות {d.checks.length} {d.checks.length === 1 ? 'שיק' : 'שיקים'} מעותדים המשוכים מחשבונו של הקונה, כדלקמן:</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="csc-checks">
              <thead><tr><th>#</th><th>מס&apos; שיק</th><th>סכום (ש&quot;ח)</th><th>תאריך פירעון</th><th /></tr></thead>
              <tbody>
                {d.checks.map((c, i) => {
                  const setC = (k: 'num' | 'amount' | 'date', v: string) => patch(x => ({ ...x, checks: x.checks.map((cc, j) => j === i ? { ...cc, [k]: v } : cc) }))
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><F value={c.num} onChange={v => setC('num', v)} min={9} ltr /></td>
                      <td><F value={c.amount} onChange={v => setC('amount', v)} min={9} /></td>
                      <td><F value={c.date} onChange={v => setC('date', v)} type="date" /></td>
                      <td><button type="button" style={{ ...iconBtn, color: 'var(--danger)' }} aria-label="מחק שיק" disabled={d.checks.length === 1}
                        onClick={() => patch(x => ({ ...x, checks: x.checks.filter((_, j) => j !== i) }))}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button type="button" className="csc-add" onClick={() => patch(x => ({ ...x, checks: [...x.checks, { num: '', amount: '', date: '' }] }))}>+ הוסף שיק</button>
            <button type="button" className="csc-add" onClick={splitChecks} title="מחלק את הסכום הכולל שווה בשווה, שיק בכל חודש מתאריך השיק הראשון">⚖️ חלק סכום שווה + תאריכים חודשיים</button>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>הקונה ימציא למוכר בעת החתימה צילום תעודת זהות וצילום השיקים.</div>
        </div>
      ) : (
        <div className="csc-p">
          <b>אמצעי תשלום: {d.payment === 'cash' ? 'תשלום במזומן במעמד החתימה' : 'העברה בנקאית לחשבון המוכר'}</b>
          <AutoText value={d.paymentDetails} onChange={v => patch(x => ({ ...x, paymentDetails: v }))}
            placeholder={d.payment === 'cash' ? 'הערות, מועד מסירת הכסף וכו׳ (אופציונלי)' : 'מספר אסמכתא, בנק, סניף וחשבון (אופציונלי)'} />
        </div>
      )}
    </div>
  )

  return createPortal(
    <div className="csc-root" dir="rtl">
      <style>{CSS}</style>

      {/* Toolbar */}
      <div className="csc-bar">
        <button type="button" onClick={handleClose} style={{ ...iconBtn, fontSize: 20, color: 'var(--text)' }} aria-label="סגור">✕</button>
        <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>📝 חוזה מכירת רכב</div>
        <span className={`csc-status ${status}`}>{status === 'signed' ? '✅ נחתם' : 'טיוטה'}</span>
        {dirty && <span style={{ fontSize: 12, color: '#b45309' }}>● לא נשמר</span>}
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={toggleSigned} disabled={!d || saving}>{status === 'signed' ? 'החזר לטיוטה' : '✅ סמן כנחתם'}</Button>
        <Button size="sm" variant="secondary" onClick={handlePrint} disabled={!d || saving}>🖨️ הדפס / PDF</Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!d}>💾 שמור</Button>
        <RowActionsMenu align="end" actions={[
          { key: 'def',  label: 'שמור נוסח סעיפים כברירת מחדל', icon: '📌', onClick: saveDefaultClauses },
          { key: 'rdef', label: 'טען נוסח ברירת המחדל שלי', icon: '↺', onClick: () => resetClauses('default'), disabled: !defClauses?.length },
          { key: 'rorg', label: 'החזר לנוסח המקורי', icon: '⟲', onClick: () => resetClauses('original') },
        ]} />
      </div>

      <div className="csc-scroll">
        {!d ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>טוען...</div>
        ) : (
          <div className="csc-paper">
            <div className="csc-title">
              <input className="csc-f csc-title-in" value={d.title} onChange={e => patch(x => ({ ...x, title: e.target.value }))} />
              <div className="csc-sub">
                שנערך ונחתם ב<F value={d.location} onChange={v => patch(x => ({ ...x, location: v }))} placeholder="מקום" min={10} bold />
                {' '}בתאריך <F value={d.date} onChange={v => patch(x => ({ ...x, date: v }))} type="date" />
              </div>
            </div>

            {party('seller', 'בין (המוכר):')}
            {party('buyer', 'לבין (הקונה):')}

            <p className="csc-p"><b>הואיל:</b> והמוכר הינו הבעלים הרשום והחוקי של כלי הרכב שפרטיו להלן:</p>
            <div className="csc-car">
              <div><small>מספר רישוי</small>
                <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <F value={d.car.plate} onChange={v => setCar('plate', v)} placeholder="מס' רכב" min={10} bold ltr />
                  <button type="button" className="csc-chip" onClick={lookupPlate} disabled={plateBusy || d.car.plate.replace(/\D/g, '').length < 5} title="משיכת פרטים ממשרד התחבורה">{plateBusy ? '⏳' : '⚡'}</button>
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#64748b' }}>שלדה: <F value={d.car.vin} onChange={v => setCar('vin', v)} placeholder="אופציונלי" min={12} ltr /></span>
              </div>
              <div><small>סוג ודגם</small><F value={d.car.model} onChange={v => setCar('model', v)} placeholder="יצרן ודגם" min={14} bold /></div>
              <div><small>שנת ייצור</small><F value={d.car.year} onChange={v => setCar('year', v)} placeholder="שנה" min={6} bold /></div>
            </div>
            <p className="csc-p"><b>והואיל:</b> והקונה מעוניין לרכוש את הרכב מהמוכר, והמוכר מעוניין למכור את הרכב לקונה, בתנאים המפורטים בהסכם זה;</p>

            <div className="csc-center">לפיכך הוסכם והותנה בין הצדדים כדלקמן:</div>

            {clauses.slice(0, 2).map((c, i) => clauseBlock(c, i))}
            {paymentBlock}
            {clauses.slice(2).map((c, i) => clauseBlock(c, i + 2))}

            <button type="button" className="csc-add" style={{ marginTop: 10 }}
              onClick={() => setClauses(list => [...list, { id: crypto.randomUUID(), title: 'סעיף חדש', items: [''] }])}>+ הוסף סעיף</button>

            <div className="csc-center" style={{ marginTop: 30 }}>ולראיה באו הצדדים על החתום:</div>
            <div className="csc-sigs">
              <div><b>המוכר:</b> {d.seller.name || '______________'}<div className="csc-sig">חתימה:</div></div>
              <div><b>הקונה:</b> {d.buyer.name || '______________'}<div className="csc-sig">חתימה:</div></div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

const CSS = `
.csc-root { position: fixed; inset: 0; z-index: 1000; background: #e2e8f0; display: flex; flex-direction: column; }
.csc-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 14px; background: #fff; border-bottom: 1px solid var(--border); box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.csc-status { font-size: 11.5px; font-weight: 700; padding: 2px 10px; border-radius: 10px; background: #f1f5f9; color: #475569; }
.csc-status.signed { background: #dcfce7; color: #166534; }
.csc-scroll { flex: 1; overflow-y: auto; padding: 12px 8px 40px; }
.csc-paper { max-width: 820px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 14px rgba(0,0,0,.08); padding: 24px 32px; font-size: 13.5px; line-height: 1.55; color: #0f172a; }
@media (max-width: 640px) { .csc-paper { padding: 14px 10px; } .csc-grid { grid-template-columns: 1fr !important; } .csc-car { grid-template-columns: 1fr 1fr !important; } .csc-car > div:first-child { grid-column: 1 / -1; border-left: none; border-bottom: 1px solid #e2e8f0; } }
.csc-f { font: inherit; color: inherit; background: #f8fafc; border: none; border-bottom: 1.5px dashed #94a3b8; border-radius: 3px 3px 0 0; padding: 0 4px; outline: none; min-width: 0; }
.csc-f:focus { background: #eef2ff; border-bottom: 1.5px solid var(--primary); }
.csc-f::placeholder { color: #94a3b8; font-weight: 400; }
.csc-t { font: inherit; color: inherit; width: 100%; resize: none; overflow: hidden; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 0 4px; outline: none; line-height: 1.5; }
.csc-t:hover { background: #f8fafc; border-color: #e2e8f0; }
.csc-t:focus { background: #eef2ff; border-color: var(--primary); }
.csc-title { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #0f172a; margin-bottom: 10px; }
.csc-title-in { font-size: 20px; font-weight: 800; text-align: center; width: 100%; background: transparent; border-bottom-color: transparent; }
.csc-title-in:hover { border-bottom-color: #cbd5e1; }
.csc-sub { color: #475569; margin-top: 2px; }
.csc-party { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; }
.csc-party-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-weight: 800; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 4px; }
.csc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 14px; }
.csc-tools { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.csc-chip { font: inherit; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 14px; border: 1.5px solid var(--primary); color: var(--primary); background: #fff; cursor: pointer; }
.csc-chip:disabled { opacity: .45; cursor: default; }
.csc-chip-ghost { border-color: #cbd5e1; color: #64748b; }
.csc-car { display: grid; grid-template-columns: 1.1fr 1.5fr .6fr; border: 1px solid #cbd5e1; border-radius: 8px; margin: 4px 0 6px; text-align: center; }
.csc-car > div { padding: 4px 6px; border-left: 1px solid #e2e8f0; }
.csc-car > div:last-child { border-left: none; }
.csc-car small { display: block; font-size: 11px; color: #64748b; }
.csc-p { margin: 2px 0; }
.csc-center { text-align: center; font-weight: 800; text-decoration: underline; text-underline-offset: 4px; margin: 10px 0 2px; }
.csc-clause { margin-top: 8px; }
.csc-clause-h { display: flex; align-items: flex-start; gap: 6px; font-size: 14px; }
.csc-num { font-weight: 800; padding-top: 2px; }
.csc-hint { font-size: 11px; color: #b45309; background: #fef3c7; padding: 1px 8px; border-radius: 8px; }
.csc-item { display: flex; align-items: flex-start; gap: 4px; padding-right: 12px; }
.csc-letter { padding-top: 2px; color: #334155; min-width: 16px; }
.csc-add { font: inherit; font-size: 12px; color: var(--primary); background: none; border: 1px dashed #c7d2fe; border-radius: 8px; padding: 3px 10px; cursor: pointer; margin: 4px 16px 0 0; }
.csc-seg { display: inline-flex; gap: 4px; padding: 3px; background: #f1f5f9; border-radius: 10px; margin: 4px 0; }
.csc-seg button { font: inherit; font-size: 13px; border: none; background: transparent; padding: 5px 14px; border-radius: 8px; cursor: pointer; color: #64748b; }
.csc-seg button.on { background: #fff; color: #0f172a; font-weight: 700; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
.csc-checks { border-collapse: collapse; font-size: 13px; }
.csc-checks th, .csc-checks td { border: 1px solid #e2e8f0; padding: 3px 6px; text-align: center; }
.csc-checks th { background: #f8fafc; font-weight: 700; }
.csc-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 10px; }
.csc-sig { margin-top: 26px; border-bottom: 1px dashed #64748b; color: #475569; }
@media (hover: hover) { .csc-clause .csc-tools { opacity: .35; transition: opacity .15s; } .csc-clause:hover .csc-tools, .csc-clause:focus-within .csc-tools { opacity: 1; } .csc-add-sub { display: none; } .csc-clause:hover .csc-add-sub, .csc-clause:focus-within .csc-add-sub { display: inline-block; } }
`
