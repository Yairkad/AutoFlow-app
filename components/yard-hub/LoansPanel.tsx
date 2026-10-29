'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  LOAN_DIRECTION_LABEL, LOAN_STATUS_LABEL, LOAN_STALE_DAYS, daysSince,
  type LoanDirection, type TireLoan,
} from '@/lib/yard/hub'
import { AddButton, Chips, Empty, Field, HubFrame, IconBtn, cardGrid, QtyStepper, Sheet, Toggle, api, fmtDate, inputCls, inputStyle, todayISO } from './ui'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'

type View = 'borrowed' | 'lent' | 'closed'

const emptyForm = {
  direction: 'borrowed' as LoanDirection, shop_name: '', shop_phone: '', loan_date: '',
  item_desc: '', qty: 1, customer_name: '', plate: '', notes: '',
}

export default function LoansPanel({ variant }: { variant: 'yard' | 'office' }) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [view, setView]       = useState<View>('borrowed')
  const [open, setOpen]       = useState<TireLoan[]>([])
  const [closed, setClosed]   = useState<TireLoan[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState<typeof emptyForm | null>(null)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [payFor, setPayFor]   = useState<TireLoan | null>(null)
  const [payAmount, setPayAmount] = useState('')

  const loadOpen = useCallback(async () => {
    try { setOpen(await api<TireLoan[]>('/api/yard/loans?status=open')) }
    catch (e) { showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { loadOpen() }, [loadOpen])
  // Other devices' changes show up without a page refresh (realtime alone is unreliable on Netfree)
  useLiveRefresh(loadOpen)

  useEffect(() => {
    if (view !== 'closed' || closed) return
    api<TireLoan[]>('/api/yard/loans?status=closed').then(setClosed)
      .catch(e => showToast(`שגיאה בטעינה: ${(e as Error).message}`, 'error'))
  }, [view, closed, showToast])

  const shops = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const l of [...open, ...(closed ?? [])]) if (!m.has(l.shop_name)) m.set(l.shop_name, l.shop_phone)
    return m
  }, [open, closed])

  const list = view === 'closed' ? (closed ?? []) : open.filter(l => l.direction === view)
  const countOf = (d: LoanDirection) => open.filter(l => l.direction === d).length

  function startNew() {
    setEditId(null)
    setForm({ ...emptyForm, direction: view === 'lent' ? 'lent' : 'borrowed', loan_date: todayISO() })
  }

  function startEdit(l: TireLoan) {
    setEditId(l.id)
    setForm({
      direction: l.direction, shop_name: l.shop_name, shop_phone: l.shop_phone ?? '', loan_date: l.loan_date,
      item_desc: l.item_desc, qty: l.qty, customer_name: l.customer_name ?? '', plate: l.plate ?? '', notes: l.notes ?? '',
    })
  }

  async function save() {
    if (!form) return
    if (!form.shop_name.trim()) return showToast('צריך שם פנצ׳ריה', 'error')
    if (!form.item_desc.trim()) return showToast('צריך מידה / דגם', 'error')
    setSaving(true)
    try {
      if (editId) {
        const row = await api<TireLoan>(`/api/yard/loans/${editId}`, 'PATCH', form)
        setOpen(p => p.map(l => l.id === editId ? row : l))
        setClosed(p => p?.map(l => l.id === editId ? row : l) ?? null)
      } else {
        const row = await api<TireLoan>('/api/yard/loans', 'POST', form)
        setOpen(p => [...p, row])
        setView(row.direction)
      }
      showToast('נשמר ✓', 'success')
      setForm(null)
    } catch (e) { showToast(`שגיאה בשמירה: ${(e as Error).message}`, 'error') }
    finally { setSaving(false) }
  }

  async function setStatus(l: TireLoan, status: TireLoan['status'], amount?: number) {
    // Optimistic: move the card right away, put it back if the server refuses
    const prevOpen = open, prevClosed = closed
    const updated = { ...l, status, amount: amount ?? l.amount, closed_at: status === 'open' ? null : new Date().toISOString() }
    if (status === 'open') {
      setClosed(p => p?.filter(x => x.id !== l.id) ?? null)
      setOpen(p => [...p, updated])
    } else {
      setOpen(p => p.filter(x => x.id !== l.id))
      setClosed(p => p ? [updated, ...p] : null)
    }
    try {
      await api(`/api/yard/loans/${l.id}`, 'PATCH', { status, ...(amount !== undefined ? { amount } : {}) })
      showToast(status === 'open' ? 'נפתח מחדש' : `סומן "${LOAN_STATUS_LABEL[status]}" ✓`, 'success')
    } catch (e) {
      setOpen(prevOpen); setClosed(prevClosed)
      showToast(`שגיאה: ${(e as Error).message}`, 'error')
    }
  }

  async function remove(l: TireLoan) {
    if (!await confirm({ msg: `למחוק את הרישום של ${l.shop_name}?`, variant: 'danger', confirmLabel: 'מחק' })) return
    try {
      await api(`/api/yard/loans/${l.id}`, 'DELETE')
      setOpen(p => p.filter(x => x.id !== l.id))
      setClosed(p => p?.filter(x => x.id !== l.id) ?? null)
    } catch (e) { showToast(`שגיאה במחיקה: ${(e as Error).message}`, 'error') }
  }

  const f = (k: keyof typeof emptyForm, v: string | number) => setForm(p => p ? { ...p, [k]: v } : p)

  return (
    <HubFrame variant={variant} title="🔁 השאלות בין פנצ׳ריות"
      subtitle="צמיגים שלקחנו מפנצ׳ריה אחרת או נתנו לה — פתוח עד שמחזירים או משלמים"
      action={<AddButton onClick={startNew}>+ השאלה חדשה</AddButton>}>
      <Chips value={view} onChange={setView} options={[
        { value: 'borrowed', label: '📥 לקחנו מהם', count: countOf('borrowed') },
        { value: 'lent',     label: '📤 נתנו להם', count: countOf('lent') },
        { value: 'closed',   label: '✓ סגורים' },
      ]} />

      {loading ? <Empty icon="⏳" text="טוען..." /> : list.length === 0 ? (
        view === 'closed' ? <Empty icon="🗂" text="אין רישומים סגורים" /> : (
          <Empty icon="✅" text={view === 'borrowed' ? 'אין צמיגים שאנחנו חייבים' : 'אין צמיגים שחייבים לנו'}
            action={<AddButton onClick={startNew}>+ השאלה חדשה</AddButton>} />
        )
      ) : (
        <div style={cardGrid}>
          {list.map(l => {
            const days = daysSince(l.loan_date)
            const stale = l.status === 'open' && days >= LOAN_STALE_DAYS
            return (
              <div key={l.id} className={`bg-white rounded-2xl border-2 flex flex-col gap-1.5 ${stale ? 'border-red-500' : 'border-slate-200'}`} style={{ padding: '14px' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-slate-900" style={{ fontSize: '18px' }}>{l.shop_name}</div>
                    <div className="text-xs text-slate-500">{LOAN_DIRECTION_LABEL[l.direction]} · {fmtDate(l.loan_date)}</div>
                  </div>
                  {l.status === 'open' ? (
                    <span className={`rounded-full font-bold text-xs ${stale ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'}`} style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      {days === 0 ? 'היום' : `${days} ימים`}
                    </span>
                  ) : (
                    <span className="rounded-full font-bold text-xs bg-green-100 text-green-800" style={{ padding: '4px 10px' }}>
                      {LOAN_STATUS_LABEL[l.status]}{l.status === 'paid' && l.amount ? ` ₪${l.amount}` : ''}
                    </span>
                  )}
                </div>
                <div className="font-bold text-slate-800" style={{ direction: 'ltr', textAlign: 'right', fontSize: '17px' }}>
                  {l.item_desc}{l.qty > 1 ? ` × ${l.qty}` : ''}
                </div>
                {(l.customer_name || l.plate) && (
                  <div className="text-sm text-slate-600">🚗 {[l.customer_name, l.plate].filter(Boolean).join(' · ')}</div>
                )}
                {l.notes && <div className="text-sm text-slate-500">📝 {l.notes}</div>}
                {l.created_by_name && <div className="text-xs text-slate-400">נרשם ע״י {l.created_by_name}</div>}

                <div className="flex flex-col gap-2 mt-auto" style={{ paddingTop: 6 }}>
                  {l.status === 'open' ? (
                    <div className="flex gap-2">
                      <button onClick={() => setStatus(l, 'returned')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold" style={{ padding: '10px 8px', fontSize: 15 }}>↩ הוחזר</button>
                      <button onClick={() => { setPayFor(l); setPayAmount('') }} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold" style={{ padding: '10px 8px', fontSize: 15 }}>₪ שולם</button>
                    </div>
                  ) : (
                    <button onClick={() => setStatus(l, 'open')} className="w-full bg-slate-100 text-slate-700 rounded-lg font-bold" style={{ padding: '10px 8px' }}>פתח מחדש</button>
                  )}
                  <div className="flex gap-1.5">
                    {l.shop_phone && <IconBtn title="חיוג לפנצ׳ריה" href={`tel:${l.shop_phone}`}>📞</IconBtn>}
                    <IconBtn title="עריכה" onClick={() => startEdit(l)}>✏️</IconBtn>
                    <span className="flex-1" />
                    {variant === 'office' && <IconBtn tone="danger" title="מחיקה" onClick={() => remove(l)}>🗑</IconBtn>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <Sheet title={editId ? 'עריכת השאלה' : 'השאלה חדשה'} onClose={() => setForm(null)}>
          <Toggle value={form.direction} onChange={v => f('direction', v)} options={[
            { value: 'borrowed', label: '📥 קיבלנו מהם', color: '#b45309' },
            { value: 'lent',     label: '📤 נתנו להם',  color: '#1d4ed8' },
          ]} />
          <Field label="פנצ׳ריה *">
            <input list="loan-shops" value={form.shop_name} autoFocus
              onChange={e => { f('shop_name', e.target.value); const ph = shops.get(e.target.value); if (ph && !form.shop_phone) f('shop_phone', ph) }}
              className={inputCls} style={inputStyle} />
            <datalist id="loan-shops">{[...shops.keys()].map(s => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="מידה / דגם *">
            <input value={form.item_desc} onChange={e => f('item_desc', e.target.value)} placeholder="205/55R16 מישלן"
              className={inputCls} style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }} />
          </Field>
          <div className="flex gap-3 flex-wrap">
            <Field label="כמות"><QtyStepper value={form.qty} onChange={n => f('qty', n)} /></Field>
            <Field label="תאריך">
              <input type="date" value={form.loan_date} onChange={e => f('loan_date', e.target.value)} className={inputCls} style={inputStyle} />
            </Field>
          </div>
          <Field label="טלפון הפנצ׳ריה">
            <input type="tel" value={form.shop_phone} onChange={e => f('shop_phone', e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <div className="flex gap-3">
            <Field label="בשביל לקוח"><input value={form.customer_name} onChange={e => f('customer_name', e.target.value)} className={inputCls} style={inputStyle} /></Field>
            <Field label="רכב"><input value={form.plate} onChange={e => f('plate', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          </div>
          <Field label="הערות"><input value={form.notes} onChange={e => f('notes', e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <button onClick={save} disabled={saving} className="bg-green-600 text-white rounded-xl font-black disabled:opacity-60" style={{ padding: '14px', fontSize: '18px' }}>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </Sheet>
      )}

      {payFor && (
        <Sheet title={`תשלום — ${payFor.shop_name}`} onClose={() => setPayFor(null)}>
          <Field label="סכום (₪) — אפשר להשאיר ריק">
            <input type="number" inputMode="decimal" value={payAmount} autoFocus onChange={e => setPayAmount(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <button onClick={() => { const l = payFor; setPayFor(null); setStatus(l, 'paid', payAmount ? Number(payAmount) : undefined) }}
            className="bg-green-600 text-white rounded-xl font-black" style={{ padding: '14px', fontSize: '18px' }}>
            ✓ סמן כשולם
          </button>
        </Sheet>
      )}
    </HubFrame>
  )
}
