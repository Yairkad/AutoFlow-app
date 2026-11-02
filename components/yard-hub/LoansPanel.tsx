'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  LOAN_DIRECTION_LABEL, LOAN_STATUS_LABEL, LOAN_STALE_DAYS, daysSince,
  type LoanDirection, type TireLoan,
} from '@/lib/yard/hub'
import { AddButton, Chips, Empty, Field, HubFrame, QtyStepper, Sheet, Toggle, api, fmtDate, inputCls, inputStyle, todayISO } from './ui'
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh'
import RowActionsMenu from '@/components/ui/RowActionsMenu'

type View = 'open' | 'closed'

const fmtPhone = (p: string) => { const d = p.replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : p }

// Grouped-by-shop table (design B): one block per shop, a row per loan. Uses the app tokens.
const CSS = `
.lp-sum{display:flex;gap:8px;flex-wrap:wrap}
.lp-pill{font-size:12px;font-weight:600;border-radius:99px;padding:1px 9px;white-space:nowrap;display:inline-flex;gap:4px;align-items:center}
.lp-pri{background:var(--primary-soft);color:var(--primary)}.lp-warn{background:var(--warning-soft);color:var(--warning)}
.lp-dan{background:var(--danger-soft);color:var(--danger)}.lp-ok{background:var(--success-soft);color:var(--success)}
.lp-shop{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg-card)}
.lp-shop.late{border-color:color-mix(in srgb,var(--danger) 45%,var(--border))}
.lp-sh{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--bg-soft);border-bottom:1px solid var(--border)}
.lp-sh b{font-size:15px;font-weight:700;overflow-wrap:anywhere}
.lp-tel{color:var(--primary);font-weight:600;font-size:13px;text-decoration:none;direction:ltr}
.lp-cols,.lp-row{display:grid;grid-template-columns:minmax(140px,1.3fr) 44px minmax(110px,1fr) 128px 90px 190px;gap:12px;align-items:center;padding:0 14px}
.lp-cols{font-size:11.5px;color:var(--text-muted);font-weight:600;padding-top:7px;padding-bottom:7px;border-bottom:1px solid var(--border)}
.lp-row{padding-top:9px;padding-bottom:9px;border-bottom:1px solid #EEF0F5;font-size:14px}
.lp-row:last-child{border-bottom:0}.lp-row.late{background:#FDF6F5}
.lp-size{font-weight:600;font-size:14.5px;direction:ltr;text-align:right;overflow-wrap:anywhere}
.lp-sub{font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.lp-cell{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0}
.lp-acts{display:flex;gap:6px;justify-content:flex-end;align-items:center}
.lp-b{border-radius:8px;padding:5px 10px;font-weight:600;font-size:13px;white-space:nowrap;cursor:pointer;font-family:inherit}
.lp-ret{background:var(--primary-soft);color:var(--primary);border:1px solid color-mix(in srgb,var(--primary) 20%,transparent)}
.lp-pay{background:var(--success);color:#fff;border:1px solid var(--success)}
.lp-re{background:var(--bg-card);color:var(--text);border:1px solid var(--border)}
@media(max-width:760px){
  .lp-cols{display:none}
  .lp-row{grid-template-columns:1fr auto;gap:6px 10px}
  .lp-row .lp-wide{grid-column:1/-1}
  .lp-row .lp-acts{grid-column:1/-1;justify-content:flex-start}
}`

const emptyForm = {
  direction: 'borrowed' as LoanDirection, shop_name: '', shop_phone: '', loan_date: '',
  item_desc: '', qty: 1, customer_name: '', plate: '', notes: '',
}

export default function LoansPanel({ variant }: { variant: 'yard' | 'office' }) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [view, setView]       = useState<View>('open')
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
  // Other devices' changes show up without a page refresh
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

  const unitsOf = (d: LoanDirection) => open.filter(l => l.direction === d).reduce((n, l) => n + l.qty, 0)
  const staleCount = open.filter(l => daysSince(l.loan_date) >= LOAN_STALE_DAYS).length

  // One block per shop; the shop waiting longest comes first
  const groups = useMemo(() => {
    const list = view === 'closed' ? (closed ?? []) : open
    const m = new Map<string, TireLoan[]>()
    for (const l of list) { const g = m.get(l.shop_name); if (g) g.push(l); else m.set(l.shop_name, [l]) }
    const arr = [...m.entries()].map(([shop, items]) => ({
      shop, items: [...items].sort((a, b) => a.loan_date.localeCompare(b.loan_date)),
      phone: items.find(i => i.shop_phone)?.shop_phone ?? null,
      oldest: Math.max(...items.map(i => daysSince(i.loan_date))),
    }))
    return view === 'closed' ? arr : arr.sort((a, b) => b.oldest - a.oldest)
  }, [open, closed, view])

  function startNew() {
    setEditId(null)
    setForm({ ...emptyForm, loan_date: todayISO() })
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
        setView('open')
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
      <style>{CSS}</style>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Chips value={view} onChange={setView} options={[
          { value: 'open',   label: 'פתוחים', count: open.length },
          { value: 'closed', label: '✓ סגורים' },
        ]} />
        {view === 'open' && open.length > 0 && (
          <div className="lp-sum">
            <span className="lp-pill lp-pri">📥 קיבלנו מהם · <b>{unitsOf('borrowed')}</b> צמיגים</span>
            <span className="lp-pill lp-pri">📤 נתנו להם · <b>{unitsOf('lent')}</b> צמיגים</span>
            {staleCount > 0 && <span className="lp-pill lp-dan">⚠ מעל {LOAN_STALE_DAYS} ימים · <b>{staleCount}</b></span>}
          </div>
        )}
      </div>

      {loading || (view === 'closed' && !closed) ? <Empty icon="⏳" text="טוען..." /> : groups.length === 0 ? (
        view === 'closed' ? <Empty icon="🗂" text="אין רישומים סגורים" /> : (
          <Empty icon="✅" text="אין השאלות פתוחות"
            hint="צמיג שלקחנו מפנצ׳ריה אחרת או נתנו לה — רושמים כאן עד שמחזירים או משלמים"
            action={<AddButton onClick={startNew}>+ השאלה חדשה</AddButton>} />
        )
      ) : groups.map(g => {
        const late = view === 'open' && g.oldest >= LOAN_STALE_DAYS
        const borrowed = g.items.filter(l => l.direction === 'borrowed').reduce((n, l) => n + l.qty, 0)
        const lent = g.items.filter(l => l.direction === 'lent').reduce((n, l) => n + l.qty, 0)
        return (
          <div key={g.shop} className={`lp-shop${late ? ' late' : ''}`}>
            <div className="lp-sh">
              <b>{g.shop}</b>
              {g.phone && <a className="lp-tel num" href={`tel:${g.phone}`}>{fmtPhone(g.phone)}</a>}
              <span style={{ flex: 1 }} />
              {borrowed > 0 && <span className="lp-pill lp-pri">📥 קיבלנו {borrowed}</span>}
              {lent > 0 && <span className="lp-pill lp-pri">📤 נתנו {lent}</span>}
              {late && <span className="lp-pill lp-dan">{g.oldest} ימים</span>}
            </div>
            <div className="lp-cols"><span>צמיג</span><span>כמות</span><span>רכב / לקוח</span><span>תאריך</span><span>נרשם ע״י</span><span /></div>
            {g.items.map(l => {
              const days = daysSince(l.loan_date)
              const stale = l.status === 'open' && days >= LOAN_STALE_DAYS
              const we = l.direction === 'borrowed'
              return (
                <div key={l.id} className={`lp-row${stale ? ' late' : ''}`}>
                  <div className="min-w-0">
                    <div className="lp-size num">{l.item_desc}</div>
                    <div className="lp-sub">{we ? '📥' : '📤'} {LOAN_DIRECTION_LABEL[l.direction]}{l.notes ? ` · 📝 ${l.notes}` : ''}</div>
                  </div>
                  <div className="num">×{l.qty}</div>
                  <div className="lp-cell lp-wide">
                    {l.plate && <span className="plate-chip" style={{ fontSize: 12 }}>{l.plate}</span>}
                    {l.customer_name && <span className="lp-sub">{l.customer_name}</span>}
                    {!l.plate && !l.customer_name && <span className="lp-sub">—</span>}
                  </div>
                  <div className="lp-cell lp-wide">
                    <span className="num">{fmtDate(l.loan_date)}</span>
                    {l.status === 'open'
                      ? <span className={`lp-pill ${stale ? 'lp-dan' : 'lp-warn'}`}>{days === 0 ? 'היום' : days === 1 ? 'יום 1' : `${days} ימים`}</span>
                      : <span className="lp-pill lp-ok">{LOAN_STATUS_LABEL[l.status]}{l.status === 'paid' && l.amount ? ` ₪${l.amount}` : ''}</span>}
                  </div>
                  <div className="lp-sub">{l.created_by_name ?? '—'}</div>
                  <div className="lp-acts">
                    {l.status === 'open' ? (<>
                      <button className="lp-b lp-ret" onClick={() => setStatus(l, 'returned')}>↩ {we ? 'החזרנו' : 'הוחזר'}</button>
                      <button className="lp-b lp-pay" onClick={() => { setPayFor(l); setPayAmount('') }}>₪ {we ? 'שילמנו' : 'שולם'}</button>
                    </>) : (
                      <button className="lp-b lp-re" onClick={() => setStatus(l, 'open')}>פתח מחדש</button>
                    )}
                    <RowActionsMenu align="end" actions={[
                      ...(l.shop_phone ? [{ key: 'tel', icon: '📞', label: 'חיוג לפנצ׳ריה', onClick: () => { window.location.href = `tel:${l.shop_phone}` } }] : []),
                      { key: 'edit', icon: '✏️', label: 'עריכה', onClick: () => startEdit(l) },
                      ...(variant === 'office' ? [{ key: 'del', icon: '🗑', label: 'מחיקה', danger: true, onClick: () => remove(l) }] : []),
                    ]} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {form && (
        <Sheet title={editId ? 'עריכת השאלה' : 'השאלה חדשה'} onClose={() => setForm(null)}>
          <Toggle value={form.direction} onChange={v => f('direction', v)} options={[
            { value: 'borrowed', label: '📥 קיבלנו מהם', color: '#b45309' },
            { value: 'lent',     label: '📤 נתנו להם',  color: '#1E2B66' },
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
