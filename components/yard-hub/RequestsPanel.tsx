'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import {
  PAYMENT_LABEL, REQUEST_KIND_LABEL, REQUEST_NEXT, REQUEST_STATUS_LABEL, daysSince, whatsappLink,
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

const PAY_COLOR: Record<PaymentStatus, string> = {
  unpaid:  'bg-red-50 text-red-700 border-red-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  paid:    'bg-green-50 text-green-700 border-green-200',
}

// Compact grid: more cards per row than the shared 320px grid
const requestGrid: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }

const STATUS_COLOR: Record<RequestStatus, string> = {
  new:       'bg-slate-200 text-slate-800',
  ordered:   'bg-amber-100 text-amber-800',
  arrived:   'bg-green-600 text-white',
  notified:  'bg-blue-100 text-blue-800',
  closed:    'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
}

// Next-step button colour per stage, so the stage reads at a glance
const NEXT_COLOR: Partial<Record<RequestStatus, string>> = {
  new:      'bg-amber-500 hover:bg-amber-600',
  ordered:  'bg-green-600 hover:bg-green-700',
  arrived:  'bg-blue-600 hover:bg-blue-700',
  notified: 'bg-slate-700 hover:bg-slate-800',
}

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
      {view === 'order' && (
        <div className="flex items-center flex-wrap gap-1 text-slate-500" style={{ fontSize: 12.5 }}>
          <span className="font-bold">שלבים:</span>
          {['חדש', 'הוזמן מספק', 'הגיע', 'עודכן הלקוח', 'סגור'].map((s, i) => (
            <span key={s} className="flex items-center gap-1">{i > 0 && <span className="text-slate-300">←</span>}<span className="bg-slate-100 rounded-md" style={{ padding: '1px 7px' }}>{s}</span></span>
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
        <div style={requestGrid}>
          {list.map(r => {
            const days = daysSince(r.created_at)
            // An inquiry is done once checked; an order walks ordered → arrived → notified → closed
            const next = r.kind === 'inquiry' && r.status === 'new' ? 'closed' : REQUEST_NEXT[r.status]
            const isOpen = r.status !== 'closed' && r.status !== 'cancelled'
            const pay = r.payment_status ?? 'unpaid'
            const left = pay === 'partial' && r.paid_amount != null && r.quoted_price != null ? round2(r.quoted_price - r.paid_amount) : null
            const payText = pay === 'partial' && r.paid_amount != null
              ? `שולם ₪${r.paid_amount}${left != null ? ` · נשאר ₪${left}` : ''}`
              : PAYMENT_LABEL[pay]
            return (
              <div key={r.id} className={`bg-white rounded-xl border-2 flex flex-col ${r.status === 'arrived' ? 'border-green-500' : 'border-slate-200'}`} style={{ padding: '10px 12px', gap: 6 }}>
                {/* Row 1: name · phone · status · ⋮ */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-slate-900 truncate" style={{ fontSize: 16 }}>{r.customer_name}</div>
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="font-bold" style={{ fontSize: 14, color: '#1d4ed8', direction: 'ltr', display: 'inline-block' }}>📞 {r.phone}</a>
                    )}
                  </div>
                  <span className={`rounded-full font-bold text-xs flex-shrink-0 ${STATUS_COLOR[r.status]}`} style={{ padding: '3px 9px', whiteSpace: 'nowrap' }}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                  <RowActionsMenu align="end" actions={[
                    ...(r.phone ? [{ key: 'wa', icon: '💬', label: 'שליחת וואטסאפ', onClick: () => window.open(whatsappLink(r.phone!, r.status === 'arrived' ? `שלום ${r.customer_name}, הצמיג שהזמנת (${r.item_desc}) הגיע אלינו 🙂` : undefined), '_blank') }] : []),
                    { key: 'call', icon: '📞', label: 'סיכום שיחה (מועד התקנה / הערה)', onClick: () => openCall(r) },
                    { key: 'edit', icon: '✏️', label: 'עריכת נתונים', onClick: () => startEdit(r) },
                    ...(isOpen ? [{ key: 'cancel', icon: '✕', label: 'ביטול הבקשה', onClick: () => setStatus(r, 'cancelled') }] : []),
                    { key: 'del', icon: '🗑', label: 'מחיקת הפנייה', danger: true, onClick: () => remove(r) },
                  ]} />
                </div>

                {/* Row 2: item · price · payment · age */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1" style={{ fontSize: 13 }}>
                  <span className="font-bold text-slate-800" style={{ direction: 'ltr', fontSize: 15 }}>{r.item_desc}{r.qty > 1 ? ` × ${r.qty}` : ''}</span>
                  {r.quoted_price != null && (
                    <span className="text-slate-600">₪{r.quoted_price}{r.qty > 1 && <span className="text-slate-400" style={{ fontSize: 12 }}> (₪{round2(r.quoted_price / r.qty)} ליח&apos;)</span>}</span>
                  )}
                  <button onClick={() => openPayment(r)} className={`rounded-full border font-bold ${PAY_COLOR[pay]}`} style={{ padding: '1px 8px', fontSize: 12 }}>
                    {payText}
                  </button>
                  <span className="text-slate-400" style={{ fontSize: 12 }}>{isOpen && days > 0 ? `${days} ימים` : fmtDate(r.created_at)}</span>
                </div>

                {r.install_at && (
                  <button onClick={() => openCall(r)} className="self-start bg-blue-50 text-blue-800 border border-blue-200 rounded-lg font-bold" style={{ padding: '2px 8px', fontSize: 13 }}>
                    🗓 התקנה: {fmtInstall(r.install_at)}
                  </button>
                )}

                {(r.supplier_name || r.plate || r.notes || r.created_by_name) && (
                  <div className="text-slate-500 flex flex-wrap gap-x-2" style={{ fontSize: 12 }}>
                    {r.supplier_name && <span>📦 ספק: {r.supplier_name}</span>}
                    {r.plate && <span>🚗 {r.plate}</span>}
                    {r.notes && <span style={{ whiteSpace: 'pre-line' }}>📝 {r.notes}</span>}
                    {r.created_by_name && <span className="text-slate-400">· {r.created_by_name}</span>}
                  </div>
                )}

                {next && (
                  <button onClick={() => advance(r, next)} className={`w-full ${r.kind === 'inquiry' ? 'bg-violet-600 hover:bg-violet-700' : NEXT_COLOR[r.status]} text-white rounded-lg font-bold mt-auto`} style={{ padding: '8px', fontSize: 14 }}>
                    {r.kind === 'inquiry' && r.status === 'new' ? '✓ בירור בוצע' : NEXT_LABEL[r.status]}
                  </button>
                )}
                {!isOpen && (
                  <button onClick={() => setStatus(r, 'new')} className="w-full bg-slate-100 text-slate-700 rounded-lg font-bold mt-auto" style={{ padding: '8px', fontSize: 14 }}>פתח מחדש</button>
                )}
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
            { value: 'paid',    label: 'שולם',       color: '#16a34a' },
          ]} />
          {payStatus === 'partial' && (
            <Field label={`כמה שולם (₪)${payFor.quoted_price != null ? ` — מתוך ₪${payFor.quoted_price}` : ''}`}>
              <input type="number" inputMode="decimal" autoFocus value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          )}
          {payStatus === 'partial' && payFor.quoted_price != null && Number(payAmount) > 0 && (
            <div className="font-bold text-amber-800" style={{ fontSize: 15 }}>נשאר לתשלום: ₪{round2(payFor.quoted_price - Number(payAmount))}</div>
          )}
          <button onClick={savePayment} className="bg-green-600 text-white rounded-xl font-black" style={{ padding: '14px', fontSize: '18px' }}>💾 שמור</button>
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
            {callFor.withStatus ? '✓ עודכן הלקוח' : '💾 שמור'}
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
            { value: 'order',   label: '📦 מחכה לצמיג', color: '#15803d' },
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
            {saving ? 'שומר...' : '💾 שמור'}
          </button>
        </Sheet>
      )}
    </HubFrame>
  )
}
