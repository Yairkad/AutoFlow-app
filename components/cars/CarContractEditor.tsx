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
import Modal from '@/components/ui/Modal'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'
import { shrinkForUpload } from '@/lib/utils/uploadCompress'
import { scanWithAgent, listScanners, getSavedScanner, saveScanner, ScannerAgentMissingError, ScannerAgentOutdatedError, ScannerDeviceNotFoundError, SCANNER_DOWNLOAD_URL, type ScannerDevice } from '@/lib/scannerAgent'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'
import {
  type ContractData, type ContractParty, type ContractClause, type MyDetails, type PayLine, type SignedFile, signedFileUrl,
  DEFAULT_CLAUSES, newContract, normalizeContract, cloneClauses, visibleClauses, itemLetter, priceToWords,
  parseAmount, fmtAmount, contractHtml, newId, payLinesTotal, checksTotal,
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
  const current = d
  const [id, setId]             = useState<string | null>(null)
  const [linkedCar, setLinkedCar] = useState<string | null>(null)
  const [status, setStatus]     = useState<'draft' | 'signed'>('draft')
  const [myDetails, setMyDetails] = useState<MyDetails | null>(null)
  const [defClauses, setDefClauses] = useState<ContractClause[] | null>(null)
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [plateBusy, setPlateBusy] = useState(false)
  // signed copy → Drive (admin + Drive connected, same rule as car documents)
  const [driveOk, setDriveOk]   = useState(false)
  const [signAsk, setSignAsk]   = useState(false)
  const [scanning, setScanning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // "📠 סרוק" → the "סורק AutoFlow" agent on this PC, like supplier invoices. Not probed in advance
  // (Chrome would ask for local-network permission); the install link shows only after a failed try.
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentMissing, setAgentMissing] = useState(false)
  const [scanDevices, setScanDevices] = useState<ScannerDevice[] | null>(null)

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
      if (profile.isAdmin) {
        fetch(`/api/drive/status?tenant_id=${profile.tenantId}`)
          .then(r => r.json()).then(j => { if (!cancelled) setDriveOk(!!j.connected) }).catch(() => {})
      }

      if (contractId) {
        const { data: row, error } = await sb.from('car_sale_contracts').select('*').eq('id', contractId).single()
        if (cancelled) return
        if (error || !row) { showToast('שגיאה בטעינת החוזה', 'error'); onClose(); return }
        setId(row.id); setLinkedCar(row.car_id); setStatus(row.status)
        setD(normalizeContract({ ...newContract(), ...(row.data as ContractData) }))
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
    // checks cover what's left after the cash / transfer lines
    const total = parseAmount(d.price) - payLinesTotal(d)
    if (total <= 0) { showToast(parseAmount(d.price) ? 'אין יתרה לחלוקה לשיקים' : 'יש למלא סכום כולל קודם', 'error'); return }
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
  async function save(nextStatus = status, override?: ContractData): Promise<boolean> {
    const d = override ?? current
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
    if (override) setD(override)
    onSaved?.()
    return true
  }

  async function handleSave() {
    if (await save()) showToast('החוזה נשמר', 'success')
  }

  async function toggleSigned() {
    const next = status === 'signed' ? 'draft' : 'signed'
    if (!await save(next)) return
    showToast(next === 'signed' ? 'החוזה סומן כנחתם' : 'החוזה הוחזר לטיוטה', 'success')
    if (next === 'signed' && driveOk && !d?.signedFile) setSignAsk(true)
  }

  // ── Signed copy ──
  async function uploadSigned(file: File) {
    if (!d || !profile) return
    setSignAsk(false); setScanning(false); setUploading(true)
    try {
      const plate = d.car.plate.trim()
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
      const base = plate ? `${plate} - הסכם מכירה חתום` : `הסכם מכירה חתום - ${d.buyer.name.trim() || 'ללא שם'} ${d.date}`
      const small = await shrinkForUpload(file)
      const fd = new FormData()
      fd.append('file', new File([small], base + ext, { type: small.type }))
      fd.append('tenant_id', profile.tenantId)
      // same folder as the car's documents; contracts without a plate go to חוזי מכירה/
      fd.append('sub_folder', plate ? 'רכבים' : 'חוזי מכירה')
      if (plate) fd.append('item_name', plate)
      const res = await fetch('/api/drive/upload', { method: 'POST', body: fd })
      if (res.status === 413) { showToast('הקובץ גדול מדי להעלאה (מקסימום כ-4MB)', 'error'); return }
      const j = await res.json().catch(() => ({ error: `שגיאת שרת (${res.status})` }))
      if (!j.id) { showToast(j.error || 'שגיאה בהעלאה', 'error'); return }
      const old = d.signedFile
      const signedFile: SignedFile = { id: j.id, name: j.name || base + ext, link: j.webViewLink }
      if (await save('signed', { ...d, signedFile })) {
        showToast('החוזה החתום נשמר בדרייב', 'success')
        if (old) removeDriveFile(old.id)
      }
    } catch {
      showToast('שגיאת רשת', 'error')
    } finally {
      setUploading(false)
    }
  }

  function agentError(e: unknown) {
    if (e instanceof ScannerAgentMissingError || e instanceof ScannerAgentOutdatedError) setAgentMissing(true)
    if (e instanceof ScannerDeviceNotFoundError) saveScanner(null)
    showToast(e instanceof Error ? e.message : 'שגיאת סריקה', 'error')
  }

  async function scanWithDevice(deviceId: string) {
    setScanDevices(null); setAgentBusy(true)
    let file: File | null = null
    try { file = await scanWithAgent(deviceId, 'contract.pdf') }
    catch (e) { agentError(e) }
    finally { setAgentBusy(false) }
    if (file) uploadSigned(file)
  }

  // pick = always show the scanner list (switch scanner), even when one is saved
  async function scanSigned(pick = false) {
    const saved = getSavedScanner()
    if (saved && !pick) return scanWithDevice(saved)
    setAgentBusy(true)
    try {
      const devices = await listScanners()
      if (devices.length === 0) { showToast('לא נמצא סורק מחובר למחשב. ודאו שהמדפסת דולקת ומחוברת', 'error'); return }
      if (devices.length === 1) { saveScanner(devices[0].id); setAgentBusy(false); return scanWithDevice(devices[0].id) }
      setScanDevices(devices)
    } catch (e) { agentError(e) }
    finally { setAgentBusy(false) }
  }

  function removeDriveFile(fileId: string) {
    if (!profile) return
    fetch('/api/drive/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: profile.tenantId, file_id: fileId }) }).catch(() => {})
  }

  async function removeSigned() {
    if (!d?.signedFile) return
    const ok = await confirm({ msg: 'למחוק את העותק החתום מהדרייב?', variant: 'danger' })
    if (!ok) return
    const fid = d.signedFile.id
    if (await save(status, { ...d, signedFile: null })) {
      removeDriveFile(fid)
      showToast('העותק החתום נמחק', 'success')
    }
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

  const paidParts = d ? payLinesTotal(d) + checksTotal(d) : 0
  const priceNum  = d ? parseAmount(d.price) : 0
  const addLine = (kind: PayLine['kind']) => patch(x => ({ ...x, payLines: [...x.payLines, { id: newId(), kind, amount: '', date: '', note: '' }] }))
  const setLine = (lid: string, k: 'amount' | 'date' | 'note', v: string) =>
    patch(x => ({ ...x, payLines: x.payLines.map(l => l.id === lid ? { ...l, [k]: v } : l) }))

  const paymentBlock = d && (
    <div className="csc-clause" key="payment">
      <div className="csc-clause-h"><span className="csc-num">3.</span><b style={{ fontSize: 14 }}>התמורה ואופן התשלום</b></div>
      <p className="csc-p">
        תמורת הרכב ישלם הקונה למוכר סך כולל של <F value={d.price} onChange={setPrice} placeholder="סכום" min={9} bold /> ש&quot;ח
        {' '}(במילים: <F value={d.priceWords} onChange={v => patch(x => ({ ...x, priceWords: v, priceWordsManual: true }))} placeholder="הסכום במילים" min={28} /> שקלים חדשים)
        {d.priceWordsManual && (
          <button type="button" style={iconBtn} title="חשב מחדש מהסכום" onClick={() => patch(x => ({ ...x, priceWords: priceToWords(x.price), priceWordsManual: false }))}>↻</button>
        )}
      </p>

      <div className="csc-paybar">
        <span style={{ fontSize: 12.5, color: '#475569' }}>אמצעי תשלום:</span>
        <button type="button" className="csc-chip" onClick={() => addLine('cash')}>+ מזומן</button>
        <button type="button" className="csc-chip" onClick={() => addLine('transfer')}>+ העברה</button>
        <button type="button" className={`csc-chip${d.checksOn ? ' on' : ''}`} onClick={() => patch(x => ({ ...x, checksOn: !x.checksOn }))}>
          {d.checksOn ? '✓ ' : '+ '}שיקים
        </button>
        {(d.payLines.length > 0 || d.checksOn) && priceNum > 0 && (
          <span className={`csc-sum${Math.abs(paidParts - priceNum) < 0.01 ? ' ok' : ''}`}>
            סה״כ חלקים: {fmtAmount(paidParts)} מתוך {fmtAmount(priceNum)} ₪
            {Math.abs(paidParts - priceNum) >= 0.01 && ` (${paidParts < priceNum ? 'חסר' : 'עודף'} ${fmtAmount(Math.abs(priceNum - paidParts))})`}
          </span>
        )}
      </div>

      {d.payLines.length === 0 && !d.checksOn && <div className="csc-p" style={{ color: '#94a3b8' }}>בחר אמצעי תשלום אחד או יותר</div>}

      {d.payLines.map(l => (
        <div key={l.id} className="csc-payline">
          <span className="csc-paykind">{l.kind === 'cash' ? '💵 מזומן' : '🏦 העברה'}</span>
          סך <F value={l.amount} onChange={v => setLine(l.id, 'amount', v)} placeholder="סכום" min={8} bold /> ש&quot;ח
          {l.kind === 'transfer' ? ' עד ' : ' בתאריך '}<F value={l.date} onChange={v => setLine(l.id, 'date', v)} type="date" />
          {!l.date && <span className="csc-hint-s">(ריק = במעמד החתימה)</span>}
          <F value={l.note} onChange={v => setLine(l.id, 'note', v)} placeholder={l.kind === 'cash' ? 'הערה (מקדמה, במסירה...)' : 'אסמכתא / בנק / חשבון'} min={18} />
          <button type="button" style={{ ...iconBtn, color: 'var(--danger)' }} aria-label="הסר תשלום"
            onClick={() => patch(x => ({ ...x, payLines: x.payLines.filter(y => y.id !== l.id) }))}>✕</button>
        </div>
      ))}

      {d.checksOn && (
        <div className="csc-payline" style={{ display: 'block' }}>
          <div style={{ marginBottom: 4 }}>
            <span className="csc-paykind">🧾 שיקים</span>
            {checksTotal(d) > 0 && <>סך <b>{fmtAmount(checksTotal(d))}</b> ש&quot;ח </>}ב-{d.checks.length} {d.checks.length === 1 ? 'שיק' : 'שיקים'} מעותדים המשוכים מחשבונו של הקונה, כדלקמן:
          </div>
          {/* one line per check, like the original contract */}
          <ul className="csc-checklist">
            {d.checks.map((c, i) => {
              const setC = (k: 'num' | 'amount' | 'date', v: string) => patch(x => ({ ...x, checks: x.checks.map((cc, j) => j === i ? { ...cc, [k]: v } : cc) }))
              return (
                <li key={i}>
                  שיק מס&apos; <F value={c.num} onChange={v => setC('num', v)} min={8} bold ltr />,
                  {' '}ע&quot;ס <F value={c.amount} onChange={v => setC('amount', v)} min={8} bold /> ש&quot;ח,
                  {' '}לתאריך: <F value={c.date} onChange={v => setC('date', v)} type="date" />
                  <button type="button" style={{ ...iconBtn, color: 'var(--danger)' }} aria-label="מחק שיק" disabled={d.checks.length === 1}
                    onClick={() => patch(x => ({ ...x, checks: x.checks.filter((_, j) => j !== i) }))}>✕</button>
                </li>
              )
            })}
          </ul>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button type="button" className="csc-add" onClick={() => patch(x => ({ ...x, checks: [...x.checks, { num: '', amount: '', date: '' }] }))}>+ הוסף שיק</button>
            <button type="button" className="csc-add" onClick={splitChecks} title="מחלק את היתרה (סכום כולל פחות מזומן והעברות) שווה בשווה, שיק בכל חודש מתאריך השיק הראשון">⚖️ חלק את היתרה שווה + תאריכים חודשיים</button>
          </div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>הקונה ימציא למוכר בעת החתימה צילום תעודת זהות וצילום השיקים.</div>
        </div>
      )}
    </div>
  )

  return createPortal(
    <div className="csc-root" dir="rtl">
      <style>{CSS}</style>

      <Modal open={signAsk} onClose={() => { setSignAsk(false); setScanDevices(null) }} title="שמירת עותק חתום" maxWidth={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            העותק יישמר בדרייב{d?.car.plate.trim() ? ` בתיקיית הרכב (רכבים/${d.car.plate.trim()})` : ' בתיקיית "חוזי מכירה"'} ויופיע גם כאן.
          </div>
          {scanDevices ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>📠 מאיזה סורק לסרוק? <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>(הבחירה תישמר במחשב הזה)</span></div>
              {scanDevices.map(dev => (
                <Button key={dev.id} variant="secondary" onClick={() => { saveScanner(dev.id); scanWithDevice(dev.id) }}>
                  {dev.name}{getSavedScanner() === dev.id ? ' ✓' : ''}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setScanDevices(null)}>חזרה</Button>
            </>
          ) : (<>
          <Button onClick={() => scanSigned()} disabled={agentBusy}>{agentBusy ? 'סורק...' : '📠 סרוק מהסורק'}</Button>
          {!agentMissing && getSavedScanner() && (
            <button type="button" onClick={() => scanSigned(true)} disabled={agentBusy}
              style={{ alignSelf: 'center', marginTop: -6, background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
              החלף סורק
            </button>
          )}
          {agentMissing && (
            <a href={SCANNER_DOWNLOAD_URL} download style={{ alignSelf: 'center', marginTop: -6, fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>
              ⬇ התקנת סורק AutoFlow למחשב
            </a>
          )}
          <Button variant="secondary" onClick={() => { setSignAsk(false); setScanning(true) }}>📷 צלם במצלמה</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>📤 העלה קובץ (PDF / תמונה)</Button>
          <Button variant="ghost" onClick={() => setSignAsk(false)}>דלג</Button>
          </>)}
        </div>
      </Modal>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadSigned(f) }} />
      {scanning && <DocumentScannerModal onComplete={uploadSigned} onClose={() => setScanning(false)} />}

      {/* Toolbar */}
      <div className="csc-bar">
        <button type="button" onClick={handleClose} style={{ ...iconBtn, fontSize: 20, color: 'var(--text)' }} aria-label="סגור">✕</button>
        <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>📝 חוזה מכירת רכב</div>
        <span className={`csc-status ${status}`}>{status === 'signed' ? '✅ נחתם' : 'טיוטה'}</span>
        {dirty && <span style={{ fontSize: 12, color: '#b45309' }}>● לא נשמר</span>}
        {d?.signedFile && <a href={signedFileUrl(d.signedFile)} target="_blank" rel="noreferrer" className="csc-chip" style={{ textDecoration: 'none' }}>📎 חוזה חתום</a>}
        {uploading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ מעלה לדרייב...</span>}
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={toggleSigned} disabled={!d || saving}>{status === 'signed' ? 'החזר לטיוטה' : '✅ סמן כנחתם'}</Button>
        <Button size="sm" variant="secondary" onClick={handlePrint} disabled={!d || saving}>🖨️ הדפס / PDF</Button>
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!d}>💾 שמור</Button>
        <RowActionsMenu align="end" actions={[
          ...(driveOk ? [
            { key: 'scan', label: d?.signedFile ? 'החלף עותק חתום (סריקה / קובץ)' : 'שמור עותק חתום (סריקה / קובץ)', icon: '📷', onClick: () => setSignAsk(true), disabled: !d || uploading },
            ...(d?.signedFile ? [{ key: 'unsign', label: 'מחק עותק חתום', icon: '🗑', danger: true, onClick: removeSigned }] : []),
          ] : []),
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
/* fixed A4 sheet with the print margins (16mm/17mm) and font, so the editor looks like the printout */
.csc-paper { width: 210mm; min-height: 297mm; box-sizing: border-box; margin: 0 auto; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.12); padding: 16mm 17mm 18mm; font-size: 14px; line-height: 1.6; color: #0f172a; }
@media (max-width: 840px) { .csc-paper { width: 100%; min-height: 0; padding: 18px 14px; border-radius: 8px; } }
@media (max-width: 640px) { .csc-grid { grid-template-columns: 1fr !important; } .csc-car { grid-template-columns: 1fr 1fr !important; } .csc-car > div:first-child { grid-column: 1 / -1; border-left: none; border-bottom: 1px solid #e2e8f0; } }
.csc-f { font: inherit; color: inherit; background: #f8fafc; border: none; border-bottom: 1.5px dashed #94a3b8; border-radius: 3px 3px 0 0; padding: 0 4px; outline: none; min-width: 0; }
.csc-f:focus { background: #eef2ff; border-bottom: 1.5px solid var(--primary); }
.csc-f::placeholder { color: #94a3b8; font-weight: 400; }
.csc-t { font: inherit; color: inherit; width: 100%; resize: none; overflow: hidden; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 0 4px; outline: none; line-height: 1.5; }
.csc-t:hover { background: #f8fafc; border-color: #e2e8f0; }
.csc-t:focus { background: #eef2ff; border-color: var(--primary); }
.csc-title { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #0f172a; margin-bottom: 10px; }
.csc-title-in { font-size: 21px; font-weight: 800; text-align: center; width: 100%; background: transparent; border-bottom-color: transparent; }
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
.csc-clause-h { display: flex; align-items: flex-start; gap: 6px; font-size: 14.5px; }
.csc-num { font-weight: 800; padding-top: 2px; }
.csc-hint { font-size: 11px; color: #b45309; background: #fef3c7; padding: 1px 8px; border-radius: 8px; }
.csc-item { display: flex; align-items: flex-start; gap: 4px; padding-right: 12px; }
.csc-letter { padding-top: 2px; color: #334155; min-width: 16px; }
.csc-add { font: inherit; font-size: 12px; color: var(--primary); background: none; border: 1px dashed #c7d2fe; border-radius: 8px; padding: 3px 10px; cursor: pointer; margin: 4px 16px 0 0; }
.csc-chip.on { background: var(--primary); color: #fff; }
.csc-paybar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.csc-sum { font-size: 12px; font-weight: 700; color: #b91c1c; background: #fef2f2; padding: 2px 10px; border-radius: 10px; }
.csc-sum.ok { color: #166534; background: #dcfce7; }
.csc-payline { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 4px 8px; margin: 3px 12px 0 0; border-right: 3px solid #e2e8f0; }
.csc-paykind { font-weight: 700; font-size: 12.5px; margin-left: 4px; white-space: nowrap; }
.csc-hint-s { font-size: 11px; color: #94a3b8; }
.csc-checklist { margin: 2px 0; padding-right: 22px; list-style: disc; }
.csc-checklist li { margin: 2px 0; }
.csc-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 10px; }
.csc-sig { margin-top: 26px; border-bottom: 1px dashed #64748b; color: #475569; }
@media (hover: hover) { .csc-clause .csc-tools { opacity: .35; transition: opacity .15s; } .csc-clause:hover .csc-tools, .csc-clause:focus-within .csc-tools { opacity: 1; } .csc-add-sub { display: none; } .csc-clause:hover .csc-add-sub, .csc-clause:focus-within .csc-add-sub { display: inline-block; } }
`
