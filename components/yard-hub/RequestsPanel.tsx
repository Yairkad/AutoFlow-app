'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import {
  PAYMENT_LABEL, REQUEST_NEXT, REQUEST_STATUS_LABEL, daysSince, whatsappLink,
  type CustomerRequest, type PaymentStatus, type RequestKind, type RequestStatus,
} from '@/lib/yard/hub'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import { AddButton, Chips, Empty, Field, HubFrame, QtyStepper, Sheet, Toggle, api, fmtDate, inputCls, inputStyle } from './ui'

type View = 'order' | 'inquiry' | 'closed'

const emptyForm = {
  kind: 'order' as RequestKind, customer_name: '', phone: '', plate: '',
  item_desc: '', qty: 1, unit_price: '', quoted_price: '', notes: '', supplier_name: '',
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** "יום ה' 23/10 · 10:00" — time left out when none was set (stored as 00:00) */
function fmtInstall(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' })
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
  return hasTime ? `${day} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : day
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 0549090911 → 054-9090-911; anything else stays as typed */
function fmtPhone(p: string): string {
  const d = p.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : p
}

// Table rows in the app tokens (same language as the loans table)
const PAY_PILL: Record<PaymentStatus, string> = { unpaid: 'rq-dan', partial: 'rq-warn', paid: 'rq-ok' }
const STATUS_PILL: Record<RequestStatus, string> = {
  new: 'rq-gray', ordered: 'rq-warn', arrived: 'rq-ok-solid', notified: 'rq-pri', closed: 'rq-ok', cancelled: 'rq-dan',
}
const NEXT_BTN: Partial<Record<RequestStatus, string>> = { new: 'rq-n-warn', ordered: 'rq-n-ok', arrived: 'rq-n-pri', notified: 'rq-n-dark' }

const CSS = `
.rq-steps{display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:12.5px;color:var(--text-muted)}
.rq-steps i{font-style:normal;background:var(--bg);border-radius:6px;padding:1px 8px}
.rq-pill{font-size:12px;font-weight:600;border-radius:99px;padding:1px 9px;white-space:nowrap;display:inline-flex;gap:4px;align-items:center;border:0;font-family:inherit;line-height:18px}
button.rq-pill{cursor:pointer}
.rq-pri{background:var(--primary-soft);color:var(--primary)}.rq-warn{background:var(--warning-soft);color:var(--warning)}
.rq-dan{background:var(--danger-soft);color:var(--danger)}.rq-ok{background:var(--success-soft);color:var(--success)}
.rq-ok-solid{background:var(--success);color:#fff}.rq-gray{background:var(--bg);color:var(--text-muted)}
.rq-tbl{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-card)}
.rq-cols,.rq-row{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(150px,1.3fr) minmax(110px,.9fr) minmax(120px,.9fr) 104px 172px;gap:12px;align-items:center;padding:0 14px}
.rq-cols{font-size:11.5px;color:var(--text-muted);font-weight:600;padding-top:8px;padding-bottom:8px;background:var(--bg-soft);border-bottom:1px solid var(--border)}
.rq-row{padding-top:10px;padding-bottom:10px;border-bottom:1px solid #EEF0F5;font-size:14px}
.rq-row:last-child{border-bottom:0}.rq-row:hover{background:#FAFBFD}
.rq-row.arrived{background:color-mix(in srgb,var(--success-soft) 60%,#fff);box-shadow:inset -4px 0 0 var(--success)}
.rq-row.noans{box-shadow:inset -4px 0 0 var(--danger)}
.rq-name{font-weight:700;font-size:15px;overflow-wrap:anywhere}
.rq-sub{font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.rq-item{font-weight:600;direction:ltr;text-align:right;overflow-wrap:anywhere}
.rq-cell{display:flex;flex-direction:column;gap:3px;min-width:0;align-items:flex-start}
.rq-line{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.rq-tel{color:var(--primary);font-weight:600;font-size:13px;text-decoration:none;direction:ltr}
.rq-acts{display:flex;gap:6px;justify-content:flex-end;align-items:center}
.rq-next{flex:1;border-radius:8px;padding:6px 10px;font-weight:600;font-size:13px;white-space:nowrap;cursor:pointer;font-family:inherit;color:#fff;border:0}
.rq-n-warn{background:var(--warning)}.rq-n-ok{background:var(--success)}.rq-n-pri{background:var(--primary)}.rq-n-dark{background:#3A4360}
.rq-n-re{background:var(--bg-card);color:var(--text);border:1px solid var(--border)}
.rq-lbl{display:none}
@media(max-width:860px){
  .rq-cols{display:none}
  .rq-row{grid-template-columns:1fr auto;gap:8px 10px}
  .rq-row .rq-wide{grid-column:1/-1}
  .rq-row .rq-acts{grid-column:1/-1}
  .rq-lbl{display:inline;font-size:12px;color:var(--text-muted)}
}`

const NEXT_LABEL: Partial<Record<RequestStatus, string>> = {
  new:      '📦 הוזמן מספק',
  ordered:  '✓ הגיע',
  arrived:  '📞 עודכן הלקוח',
  notified: '✔ סגור',
}

export default function RequestsPanel({ variant }: { variant: 'yard' | 'office' }) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [view, setView]       = useState<View>('order')
  const [open, setOpen]       = useState<CustomerRequest[]>([])
  const [closed, setClosed]   = useState<CustomerRequest[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState<typeof emptyForm | null>(null)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [payFor, setPayFor]   = useState<CustomerRequest | null>(null)
  const [payStatus, setPayStatus] = useState<PaymentStatus>('unpaid')
  const [payAmount, setPayAmount] = useState('')
  const [supplierFor, setSupplierFor] = useState<CustomerRequest | null>(null)
  const [supplierText, setSupplierText] = useState('')
  const [suppliers, setSuppliers] = useState<string[]>([])
  // "📞 סיכום שיחה": optional install appointment and/or a note; withStatus = also move the request on
  const [callFor, setCallFor] = useState<{ r: CustomerRequest; withStatus?: RequestStatus } | null>(null)
  const [callDate, setCallDate] = useState('')
  const [callTime, setCallTime] = useState('')
  const [callNote, setCallNote] = useState('')

  const loadOpen = useCallback(async () => {
    try { setOpen(await api<CustomerRequest[]>('/api/yard/requests?status=open')) }
    catch (e) { showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { loadOpen() }, [loadOpen])
  // Changes made on other devices show up without refreshing the page
  useLiveRefresh(loadOpen)

  useEffect(() => {
    api<string[]>('/api/yard/suppliers').then(setSuppliers).catch(() => {})
  }, [])

  useEffect(() => {
    if (view !== 'closed' || closed) return
    api<CustomerRequest[]>('/api/yard/requests?status=closed').then(setClosed)
      .catch(e => showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error'))
  }, [view, closed, showToast])

  // "Arrived" first — those customers need a call now
  const list = view === 'closed'
    ? (closed ?? [])
    : open.filter(r => r.kind === view).sort((a, b) => Number(b.status === 'arrived') - Number(a.status === 'arrived'))
  const countOf = (k: RequestKind) => open.filter(r => r.kind === k).length

  function startNew() {
    setEditId(null)
    setForm({ ...emptyForm, kind: view === 'inquiry' ? 'inquiry' : 'order' })
  }

  function startEdit(r: CustomerRequest) {
    setEditId(r.id)
    setForm({
      kind: r.kind, customer_name: r.customer_name, phone: r.phone ?? '', plate: r.plate ?? '',
      item_desc: r.item_desc, qty: r.qty, notes: r.notes ?? '',
      quoted_price: r.quoted_price != null ? String(r.quoted_price) : '',
      unit_price: r.quoted_price != null ? String(round2(r.quoted_price / Math.max(1, r.qty))) : '',
      supplier_name: r.supplier_name ?? '',
    })
  }

  async function save() {
    if (!form) return
    if (!form.customer_name.trim()) return showToast('צריך שם לקוח', 'error')
    if (!form.item_desc.trim()) return showToast('צריך מידה / מוצר', 'error')
    setSaving(true)
    const body = { ...form, unit_price: undefined, quoted_price: form.quoted_price === '' ? null : Number(form.quoted_price) }
    try {
      if (editId) {
        const row = await api<CustomerRequest>(`/api/yard/requests/${editId}`, 'PATCH', body)
        setOpen(p => p.map(r => r.id === editId ? row : r))
        setClosed(p => p?.map(r => r.id === editId ? row : r) ?? null)
      } else {
        const row = await api<CustomerRequest>('/api/yard/requests', 'POST', body)
        setOpen(p => [...p, row])
        setView(row.kind)
      }
      showToast('נשמר ✓', 'success')
      setForm(null)
    } catch (e) { showToast(`שגיאה בשמירה: ${(e as Error).message}`, 'error') }
    finally { setSaving(false) }
  }

  // Optimistic patch of one request (payment / supplier); rolls back on error
  async function patch(r: CustomerRequest, changes: Partial<CustomerRequest>) {
    const apply = (x: CustomerRequest) => x.id === r.id ? { ...x, ...changes } : x
    const prevOpen = open, prevClosed = closed
    setOpen(p => p.map(apply)); setClosed(p => p?.map(apply) ?? null)
    try { await api(`/api/yard/requests/${r.id}`, 'PATCH', changes) }
    catch (e) { setOpen(prevOpen); setClosed(prevClosed); showToast(`שגיאה: ${(e as Error).message}`, 'error') }
  }

  function openPayment(r: CustomerRequest) {
    setPayFor(r); setPayStatus(r.payment_status ?? 'unpaid'); setPayAmount(r.paid_amount != null ? String(r.paid_amount) : '')
  }

  function savePayment() {
    if (!payFor) return
    if (payStatus === 'partial' && !(Number(payAmount) > 0)) return showToast('כמה שולם?', 'error')
    patch(payFor, { payment_status: payStatus, paid_amount: payStatus === 'partial' ? Number(payAmount) : null })
    setPayFor(null)
  }

  // "Ordered from supplier": ask which supplier first (can be skipped).
  // "Customer updated": the call is where the install time gets agreed — offer to record it.
  function advance(r: CustomerRequest, next: RequestStatus) {
    if (next === 'ordered' && r.kind === 'order' && !r.supplier_name) { setSupplierFor(r); setSupplierText(''); return }
    if (next === 'notified') { openCall(r, next); return }
    setStatus(r, next)
  }

  function openCall(r: CustomerRequest, withStatus?: RequestStatus) {
    const d = r.install_at ? new Date(r.install_at) : null
    setCallFor({ r, withStatus })
    setCallDate(d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '')
    setCallTime(d && (d.getHours() || d.getMinutes()) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '')
    setCallNote('')
  }

  function saveCall(skip = false) {
    if (!callFor) return
    const { r, withStatus } = callFor
    setCallFor(null)
    const changes: Partial<CustomerRequest> = {}
    if (!skip) {
      const installAt = callDate ? new Date(`${callDate}T${callTime || '00:00'}`).toISOString() : null
      if (installAt !== (r.install_at ? new Date(r.install_at).toISOString() : null)) changes.install_at = installAt
      const note = callNote.trim()
      if (note) {
        const now = new Date()
        const line = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}: ${note}`
        changes.notes = r.notes ? `${r.notes}\n${line}` : line
      }
      // A logged conversation means the customer was reached
      if ((r.no_answer_count ?? 0) > 0) { changes.no_answer_count = 0; changes.no_answer_at = null }
    }
    if (withStatus) setStatus(r, withStatus, changes)
    else if (Object.keys(changes).length) patch(r, changes)
  }

  async function setStatus(r: CustomerRequest, status: RequestStatus, extra: Partial<CustomerRequest> = {}) {
    const prevOpen = open, prevClosed = closed
    const updated = { ...r, ...extra, status, updated_at: new Date().toISOString() }
    const isClosed = status === 'closed' || status === 'cancelled'
    setOpen(p => isClosed ? p.filter(x => x.id !== r.id) : (p.some(x => x.id === r.id) ? p.map(x => x.id === r.id ? updated : x) : [...p, updated]))
    setClosed(p => p ? (isClosed ? [updated, ...p.filter(x => x.id !== r.id)] : p.filter(x => x.id !== r.id)) : null)
    try {
      await api(`/api/yard/requests/${r.id}`, 'PATCH', { status, ...extra })
    } catch (e) {
      setOpen(prevOpen); setClosed(prevClosed)
      showToast(`שגיאה: ${(e as Error).message}`, 'error')
    }
  }

  async function remove(r: CustomerRequest) {
    if (!await confirm({ msg: `למחוק את הבקשה של ${r.customer_name}?`, variant: 'danger', confirmLabel: 'מחק' })) return
    try {
      await api(`/api/yard/requests/${r.id}`, 'DELETE')
      setOpen(p => p.filter(x => x.id !== r.id))
      setClosed(p => p?.filter(x => x.id !== r.id) ?? null)
    } catch (e) { showToast(`שגיאה במחיקה: ${(e as Error).message}`, 'error') }
  }

  const f = (k: keyof typeof emptyForm, v: string | number) => setForm(p => p ? { ...p, [k]: v } : p)
  // Unit price and total stay in sync: either one can be typed; qty changes keep the unit price
  const setQty = (qty: number) => setForm(p => p ? { ...p, qty, quoted_price: p.unit_price === '' ? p.quoted_price : String(round2(Number(p.unit_price) * qty)) } : p)
  const setUnit = (v: string) => setForm(p => p ? { ...p, unit_price: v, quoted_price: v === '' ? '' : String(round2(Number(v) * p.qty)) } : p)
  const setTotal = (v: string) => setForm(p => p ? { ...p, quoted_price: v, unit_price: v === '' ? '' : String(round2(Number(v) / p.qty)) } : p)

  return (
    <HubFrame variant={variant} title="⏳ לקוחות ממתינים"
      subtitle="לקוח שמחכה לצמיג שהזמנו בשבילו, או שצריך לברר בשבילו משהו ולחזור אליו"
      action={<AddButton onClick={startNew}>+ לקוח חדש</AddButton>}>
      <Chips value={view} onChange={setView} options={[
        { value: 'order',   label: '📦 מחכים לצמיג', count: countOf('order') },
        { value: 'inquiry', label: '❓ לברר וחזור', count: countOf('inquiry') },
        { value: 'closed',  label: '✓ סגורים' },
      ]} />
      <style>{CSS}</style>
      {view === 'order' && (
        <div className="rq-steps">
          <b>שלבים:</b>
          {['חדש', 'הוזמן מספק', 'הגיע', 'עודכן הלקוח', 'סגור'].map((st, k) => (
            <span key={st} className="rq-line">{k > 0 && <span style={{ color: '#A6ADBF' }}>←</span>}<i>{st}</i></span>
          ))}
        </div>
      )}

      {loading ? <Empty icon="⏳" text="טוען..." /> : list.length === 0 ? (
        view === 'closed' ? <Empty icon="🗂" text="אין בקשות סגורות" /> : (
          <Empty icon="✅" text={view === 'order' ? 'אין לקוחות שמחכים לצמיג' : 'אין בירורים פתוחים'}
            hint={view === 'order' ? 'כשלקוח מזמין צמיג שאין במלאי — רושמים אותו כאן, ומעדכנים אותו כשהצמיג מגיע' : 'שאלה של לקוח שצריך לבדוק ולחזור אליו'}
            action={<AddButton onClick={startNew}>+ לקוח חדש</AddButton>} />
        )
      ) : (
        <div className="rq-tbl">
          <div className="rq-cols"><span>לקוח</span><span>{view === 'inquiry' ? 'מה לברר' : 'צמיג / פריט'}</span><span>סטטוס</span><span>מחיר / תשלום</span><span>נפתח</span><span /></div>
          {list.map(r => {
            const days = daysSince(r.created_at)
            // An inquiry is done once checked; an order walks ordered → arrived → notified → closed
            const next = r.kind === 'inquiry' && r.status === 'new' ? 'closed' : REQUEST_NEXT[r.status]
            const isOpen = r.status !== 'closed' && r.status !== 'cancelled'
            const noAns = isOpen && (r.no_answer_count ?? 0) > 0
            const pay = r.payment_status ?? 'unpaid'
            const left = pay === 'partial' && r.paid_amount != null && r.quoted_price != null ? round2(r.quoted_price - r.paid_amount) : null
            const payText = pay === 'partial' && r.paid_amount != null
              ? `שולם ₪${r.paid_amount}${left != null ? ` · נשאר ₪${left}` : ''}`
              : PAYMENT_LABEL[pay]
            return (
              <div key={r.id} className={`rq-row${r.status === 'arrived' ? ' arrived' : noAns ? ' noans' : ''}`}>
                {/* Customer */}
                <div className="rq-cell">
                  <span className="rq-name">{r.customer_name}</span>
                  <span className="rq-line">
                    {r.phone ? <a className="rq-tel num" href={`tel:${r.phone}`}>{fmtPhone(r.phone)}</a> : <span className="rq-sub">אין טלפון</span>}
                    {r.plate && <span className="plate-chip" style={{ fontSize: 12 }}>{r.plate}</span>}
                  </span>
                </div>

                {/* Item */}
                <div className="rq-cell rq-wide">
                  <span className="rq-item num">{r.item_desc}{r.qty > 1 ? ` × ${r.qty}` : ''}</span>
                  {r.supplier_name && <span className="rq-sub">ספק: {r.supplier_name}</span>}
                  {r.install_at && (
                    <button onClick={() => openCall(r)} className="rq-pill rq-pri">🗓 התקנה: {fmtInstall(r.install_at)}</button>
                  )}
                  {r.notes && <span className="rq-sub" style={{ whiteSpace: 'pre-line' }}>📝 {r.notes}</span>}
                </div>

                {/* Status */}
                <div className="rq-line rq-wide">
                  <span className={`rq-pill ${STATUS_PILL[r.status]}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
                  {noAns && (
                    <span className="rq-pill rq-dan" title={r.no_answer_at ? `ניסיון אחרון: ${fmtDate(r.no_answer_at)}` : undefined}>
                      📵 לא ענה{(r.no_answer_count ?? 0) > 1 ? ` ×${r.no_answer_count}` : ''}{r.no_answer_at ? ` · ${fmtDate(r.no_answer_at)}` : ''}
                    </span>
                  )}
                </div>

                {/* Price + payment */}
                <div className="rq-line rq-wide">
                  {r.quoted_price != null
                    ? <span className="num" style={{ fontWeight: 600 }}>₪{r.quoted_price}{r.qty > 1 && <span className="rq-sub"> (₪{round2(r.quoted_price / r.qty)} ליח&apos;)</span>}</span>
                    : <span className="rq-sub">אין מחיר</span>}
                  <button className={`rq-pill ${PAY_PILL[pay]}`} onClick={() => openPayment(r)}>{payText}</button>
                </div>

                {/* Opened */}
                <div className="rq-cell rq-wide">
                  <span className="rq-line">
                    <span className="rq-lbl">נפתח:</span>
                    <span className="num">{fmtDate(r.created_at)}</span>
                    {isOpen && days > 0 && <span className={`rq-pill ${days >= 7 ? 'rq-dan' : 'rq-gray'}`}>{days} ימים</span>}
                  </span>
                  {r.created_by_name && <span className="rq-sub">{r.created_by_name}</span>}
                </div>

                {/* Actions */}
                <div className="rq-acts">
                  {next && (
                    <button onClick={() => advance(r, next)} className={`rq-next ${r.kind === 'inquiry' ? 'rq-n-pri' : NEXT_BTN[r.status]}`}>
                      {r.kind === 'inquiry' && r.status === 'new' ? '✓ בירור בוצע' : NEXT_LABEL[r.status]}
                    </button>
                  )}
                  {!isOpen && <button onClick={() => setStatus(r, 'new')} className="rq-next rq-n-re">פתח מחדש</button>}
                  <RowActionsMenu align="end" actions={[
                    ...(r.phone ? [{ key: 'wa', icon: '💬', label: 'שליחת וואטסאפ', onClick: () => window.open(whatsappLink(r.phone!, r.status === 'arrived' ? `שלום ${r.customer_name}, הצמיג שהזמנת (${r.item_desc}) הגיע אלינו 🙂` : undefined), '_blank') }] : []),
                    ...(isOpen ? [{ key: 'noans', icon: '📵', label: 'חייגנו — לא ענה', onClick: () => patch(r, { no_answer_count: (r.no_answer_count ?? 0) + 1, no_answer_at: new Date().toISOString() }) }] : []),
                    ...((r.no_answer_count ?? 0) > 0 ? [{ key: 'reached', icon: '✓', label: 'ענה — נקה סימון', onClick: () => patch(r, { no_answer_count: 0, no_answer_at: null }) }] : []),
                    { key: 'call', icon: '📞', label: 'סיכום שיחה (מועד התקנה / הערה)', onClick: () => openCall(r) },
                    { key: 'edit', icon: '✏️', label: 'עריכת נתונים', onClick: () => startEdit(r) },
                    ...(isOpen ? [{ key: 'cancel', icon: '✕', label: 'ביטול הבקשה', onClick: () => setStatus(r, 'cancelled') }] : []),
                    { key: 'del', icon: '🗑', label: 'מחיקת הפנייה', danger: true, onClick: () => remove(r) },
                  ]} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {payFor && (
        <Sheet title={`תשלום — ${payFor.customer_name}`} onClose={() => setPayFor(null)}>
          <Toggle value={payStatus} onChange={setPayStatus} options={[
            { value: 'unpaid',  label: 'לא שולם',    color: '#dc2626' },
            { value: 'partial', label: 'שולם חלקית', color: '#d97706' },
            { value: 'paid',    label: 'שולם',       color: 'var(--success)' },
          ]} />
          {payStatus === 'partial' && (
            <Field label={`כמה שולם (₪)${payFor.quoted_price != null ? ` — מתוך ₪${payFor.quoted_price}` : ''}`}>
              <input type="number" inputMode="decimal" autoFocus value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          )}
          {payStatus === 'partial' && payFor.quoted_price != null && Number(payAmount) > 0 && (
            <div className="font-bold text-amber-800" style={{ fontSize: 15 }}>נשאר לתשלום: ₪{round2(payFor.quoted_price - Number(payAmount))}</div>
          )}
          <button onClick={savePayment} className="bg-green-600 text-white rounded-xl font-black" style={{ padding: '14px', fontSize: '18px' }}>שמור</button>
        </Sheet>
      )}

      {supplierFor && (
        <Sheet title="מאיזה ספק הזמנו?" onClose={() => setSupplierFor(null)}>
          <Field label="ספק">
            <input list="req-suppliers" autoFocus value={supplierText} onChange={e => setSupplierText(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <button onClick={() => { const r = supplierFor; setSupplierFor(null); setStatus(r, 'ordered', supplierText.trim() ? { supplier_name: supplierText.trim() } : {}) }}
            className="bg-green-600 text-white rounded-xl font-black" style={{ padding: '14px', fontSize: '18px' }}>
            ✓ הוזמן
          </button>
          <button onClick={() => { const r = supplierFor; setSupplierFor(null); setStatus(r, 'ordered') }}
            className="text-slate-500 font-semibold" style={{ padding: 6 }}>
            דלג — בלי ספק
          </button>
        </Sheet>
      )}
      {callFor && (
        <Sheet title={`📞 סיכום שיחה — ${callFor.r.customer_name}`} onClose={() => setCallFor(null)}>
          <Field label="מועד הגעה להתקנה (לא חובה)">
            <div className="flex gap-2">
              <input type="date" value={callDate} onChange={e => setCallDate(e.target.value)} className={inputCls} style={inputStyle} />
              <input type="time" value={callTime} onChange={e => setCallTime(e.target.value)} disabled={!callDate} className={inputCls} style={{ ...inputStyle, width: 120 }} />
              {callDate && (
                <button onClick={() => { setCallDate(''); setCallTime('') }} className="text-slate-500 font-bold" style={{ padding: '0 6px' }} title="בלי מועד">✕</button>
              )}
            </div>
          </Field>
          <Field label="הערה מהשיחה (לא חובה)">
            <input value={callNote} onChange={e => setCallNote(e.target.value)} placeholder="למשל: יגיע אחרי העבודה, ביקש איזון"
              className={inputCls} style={inputStyle} />
          </Field>
          <button onClick={() => saveCall()} className="bg-green-600 text-white rounded-xl font-black" style={{ padding: '14px', fontSize: '18px' }}>
            {callFor.withStatus ? '✓ עודכן הלקוח' : 'שמור'}
          </button>
          {callFor.withStatus && (
            <button onClick={() => saveCall(true)} className="text-slate-500 font-semibold" style={{ padding: 6 }}>
              דלג — בלי מועד והערה
            </button>
          )}
        </Sheet>
      )}

      <datalist id="req-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist>

      {form && (
        <Sheet title={editId ? 'עריכת בקשה' : 'לקוח חדש'} onClose={() => setForm(null)}>
          <Toggle value={form.kind} onChange={v => f('kind', v)} options={[
            { value: 'order',   label: '📦 מחכה לצמיג', color: 'var(--success)' },
            { value: 'inquiry', label: '❓ צריך לברר',  color: '#7c3aed' },
          ]} />
          <Field label="שם לקוח *">
            <input value={form.customer_name} autoFocus onChange={e => f('customer_name', e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="טלפון">
            <input type="tel" value={form.phone} onChange={e => f('phone', e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="מידה / מוצר *">
            <input value={form.item_desc} onChange={e => f('item_desc', e.target.value)} placeholder="205/55R16"
              className={inputCls} style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }} />
          </Field>
          <div className="flex gap-3 flex-wrap">
            <Field label="כמות"><QtyStepper value={form.qty} onChange={setQty} /></Field>
            <Field label="מחיר ליח' (₪)">
              <input type="number" inputMode="decimal" value={form.unit_price} onChange={e => setUnit(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 110 }} />
            </Field>
            <Field label="סה״כ (₪)">
              <input type="number" inputMode="decimal" value={form.quoted_price} onChange={e => setTotal(e.target.value)} className={inputCls} style={{ ...inputStyle, width: 110 }} />
            </Field>
          </div>
          <Field label="ספק (מאיפה הזמנו)">
            <input list="req-suppliers" value={form.supplier_name} onChange={e => f('supplier_name', e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="רכב"><input value={form.plate} onChange={e => f('plate', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <Field label="הערות"><input value={form.notes} onChange={e => f('notes', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <button onClick={save} disabled={saving} className="bg-green-600 text-white rounded-xl font-black disabled:opacity-60" style={{ padding: '14px', fontSize: '18px' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </Sheet>
      )}
    </HubFrame>
  )
}
