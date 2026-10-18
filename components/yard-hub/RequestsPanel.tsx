'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  REQUEST_KIND_LABEL, REQUEST_NEXT, REQUEST_STATUS_LABEL, daysSince, whatsappLink,
  type CustomerRequest, type RequestKind, type RequestStatus,
} from '@/lib/yard/hub'
import { Chips, Empty, Field, HubFrame, QtyStepper, Sheet, Toggle, api, fmtDate, inputCls, inputStyle } from './ui'

type View = 'order' | 'inquiry' | 'closed'

const emptyForm = {
  kind: 'order' as RequestKind, customer_name: '', phone: '', plate: '',
  item_desc: '', qty: 1, quoted_price: '', notes: '',
}

const STATUS_COLOR: Record<RequestStatus, string> = {
  new:       'bg-slate-200 text-slate-800',
  ordered:   'bg-amber-100 text-amber-800',
  arrived:   'bg-green-600 text-white',
  notified:  'bg-blue-100 text-blue-800',
  closed:    'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
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

  const loadOpen = useCallback(async () => {
    try { setOpen(await api<CustomerRequest[]>('/api/yard/requests?status=open')) }
    catch (e) { showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { loadOpen() }, [loadOpen])

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
      item_desc: r.item_desc, qty: r.qty, quoted_price: r.quoted_price != null ? String(r.quoted_price) : '', notes: r.notes ?? '',
    })
  }

  async function save() {
    if (!form) return
    if (!form.customer_name.trim()) return showToast('צריך שם לקוח', 'error')
    if (!form.item_desc.trim()) return showToast('צריך מידה / מוצר', 'error')
    setSaving(true)
    const body = { ...form, quoted_price: form.quoted_price === '' ? null : Number(form.quoted_price) }
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

  async function setStatus(r: CustomerRequest, status: RequestStatus) {
    const prevOpen = open, prevClosed = closed
    const updated = { ...r, status, updated_at: new Date().toISOString() }
    const isClosed = status === 'closed' || status === 'cancelled'
    setOpen(p => isClosed ? p.filter(x => x.id !== r.id) : (p.some(x => x.id === r.id) ? p.map(x => x.id === r.id ? updated : x) : [...p, updated]))
    setClosed(p => p ? (isClosed ? [updated, ...p.filter(x => x.id !== r.id)] : p.filter(x => x.id !== r.id)) : null)
    try {
      await api(`/api/yard/requests/${r.id}`, 'PATCH', { status })
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

  return (
    <HubFrame variant={variant} title="⏳ לקוחות ממתינים ובירורים" action={
      <button onClick={startNew} className="bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold" style={{ padding: '10px 18px', fontSize: '16px' }}>
        + לקוח חדש
      </button>
    }>
      <Chips value={view} onChange={setView} options={[
        { value: 'order',   label: `📦 מחכים לצמיג (${countOf('order')})` },
        { value: 'inquiry', label: `❓ לברר (${countOf('inquiry')})` },
        { value: 'closed',  label: '✓ סגורים' },
      ]} />

      {loading ? <Empty icon="⏳" text="טוען..." /> : list.length === 0 ? (
        <Empty icon="✅" text={view === 'closed' ? 'אין בקשות סגורות' : 'אין לקוחות ממתינים'} />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {list.map(r => {
            const days = daysSince(r.created_at)
            // An inquiry is done once checked; an order walks ordered → arrived → notified → closed
            const next = r.kind === 'inquiry' && r.status === 'new' ? 'closed' : REQUEST_NEXT[r.status]
            const isOpen = r.status !== 'closed' && r.status !== 'cancelled'
            return (
              <div key={r.id} className={`bg-white rounded-2xl border-2 flex flex-col gap-1.5 ${r.status === 'arrived' ? 'border-green-500' : 'border-slate-200'}`} style={{ padding: '14px' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-900" style={{ fontSize: '18px' }}>{r.customer_name}</div>
                    <div className="text-xs text-slate-500">{REQUEST_KIND_LABEL[r.kind]} · {fmtDate(r.created_at)}{isOpen && days > 0 ? ` · ${days} ימים` : ''}</div>
                  </div>
                  <span className={`rounded-full font-bold text-xs ${STATUS_COLOR[r.status]}`} style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="font-bold text-slate-800" style={{ direction: 'ltr', textAlign: 'right', fontSize: '17px' }}>
                  {r.item_desc}{r.qty > 1 ? ` × ${r.qty}` : ''}
                </div>
                {(r.quoted_price != null || r.plate) && (
                  <div className="text-sm text-slate-600">
                    {[r.quoted_price != null ? `💰 נאמר ללקוח ₪${r.quoted_price}` : null, r.plate ? `🚗 ${r.plate}` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
                {r.notes && <div className="text-sm text-slate-500">📝 {r.notes}</div>}
                {r.created_by_name && <div className="text-xs text-slate-400">נרשם ע״י {r.created_by_name}</div>}

                <div className="flex gap-2 flex-wrap mt-1">
                  {next && (
                    <button onClick={() => setStatus(r, next)} className="flex-1 bg-blue-600 text-white rounded-lg font-bold" style={{ padding: '9px 8px' }}>
                      {r.kind === 'inquiry' && r.status === 'new' ? '✓ בירור בוצע' : NEXT_LABEL[r.status]}
                    </button>
                  )}
                  {!isOpen && (
                    <button onClick={() => setStatus(r, 'new')} className="flex-1 bg-slate-100 text-slate-700 rounded-lg font-bold" style={{ padding: '9px 8px' }}>פתח מחדש</button>
                  )}
                  {r.phone && (<>
                    <a href={whatsappLink(r.phone, r.status === 'arrived' ? `שלום ${r.customer_name}, הצמיג שהזמנת (${r.item_desc}) הגיע אלינו 🙂` : undefined)}
                      target="_blank" rel="noreferrer" className="bg-green-600 text-white rounded-lg font-bold text-center" style={{ padding: '9px 12px' }} title="וואטסאפ">💬</a>
                    <a href={`tel:${r.phone}`} className="bg-slate-100 text-slate-700 rounded-lg font-bold text-center" style={{ padding: '9px 12px' }} title="חיוג">📞</a>
                  </>)}
                  <button onClick={() => startEdit(r)} className="bg-slate-100 text-slate-700 rounded-lg font-bold" style={{ padding: '9px 12px' }} title="עריכה">✏️</button>
                  {isOpen && (
                    <button onClick={() => setStatus(r, 'cancelled')} className="bg-slate-100 text-slate-500 rounded-lg font-bold" style={{ padding: '9px 12px' }} title="ביטול">✕</button>
                  )}
                  {variant === 'office' && (
                    <button onClick={() => remove(r)} className="bg-red-50 text-red-600 rounded-lg font-bold" style={{ padding: '9px 12px' }} title="מחיקה">🗑</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
            <Field label="כמות"><QtyStepper value={form.qty} onChange={n => f('qty', n)} /></Field>
            <Field label="מחיר שנאמר (₪)">
              <input type="number" inputMode="decimal" value={form.quoted_price} onChange={e => f('quoted_price', e.target.value)} className={inputCls} style={{ ...inputStyle, width: 130 }} />
            </Field>
          </div>
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
