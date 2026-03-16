'use client'

import { useState, useEffect, useCallback } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduledPayment {
  id: string
  tenant_id: string
  description: string
  amount: number
  due_date: string        // ISO date YYYY-MM-DD
  payment_method: 'check' | 'transfer'
  supplier_id: string | null
  category: string | null
  is_paid: boolean
  paid_date: string | null
  expense_id: string | null
  notes: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  suppliers: { id: string; name: string }[]
  tenantId: string
  supabase: SupabaseClient
  onRefresh?: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  expenseCats: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('he-IL')
}

function daysUntil(isoDate: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(isoDate + 'T00:00:00'); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function statusInfo(p: ScheduledPayment): { label: string; color: string; bg: string } {
  if (p.is_paid) return { label: 'שולם', color: '#16a34a', bg: '#f0fdf4' }
  const d = daysUntil(p.due_date)
  if (d < 0)  return { label: `באיחור ${Math.abs(d)} ימים`, color: '#dc2626', bg: '#fef2f2' }
  if (d === 0) return { label: 'היום!', color: '#dc2626', bg: '#fef2f2' }
  if (d <= 7)  return { label: `עוד ${d} ימים`, color: '#d97706', bg: '#fffbeb' }
  if (d <= 30) return { label: `עוד ${d} ימים`, color: '#2563eb', bg: '#eff6ff' }
  return { label: `עוד ${d} ימים`, color: 'var(--text-muted)', bg: '#f8fafc' }
}

// ─── Style constants ──────────────────────────────────────────────────────────

const SEL: React.CSSProperties = {
  padding: '8px 12px', fontSize: '14px',
  border: '1px solid var(--border)', borderRadius: '8px',
  background: '#fff', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
  width: '100%',
}
const TH: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'right',
  fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'right',
  verticalAlign: 'middle', fontSize: '13px',
}
const ICON_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 6px', borderRadius: '6px', fontSize: '15px', opacity: 0.7,
}

// ─── Form defaults ────────────────────────────────────────────────────────────

function todayIso() { return new Date().toISOString().slice(0, 10) }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduledPaymentsModal({
  open, onClose, suppliers, tenantId, supabase, onRefresh, showToast, expenseCats,
}: Props) {
  const [rows,    setRows]    = useState<ScheduledPayment[]>([])
  const [loading, setLoading] = useState(false)

  // Form modal
  const [formOpen,  setFormOpen]  = useState(false)
  const [editItem,  setEditItem]  = useState<ScheduledPayment | null>(null)
  const [saving,    setSaving]    = useState(false)

  // Form fields
  const [fDesc,    setFDesc]    = useState('')
  const [fAmount,  setFAmount]  = useState('')
  const [fDue,     setFDue]     = useState('')
  const [fMethod,  setFMethod]  = useState<'check' | 'transfer'>('check')
  const [fSupplier, setFSupplier] = useState('')
  const [fNotes,   setFNotes]   = useState('')

  // Pay modal
  const [payOpen,   setPayOpen]   = useState(false)
  const [payItem,   setPayItem]   = useState<ScheduledPayment | null>(null)
  const [payDate,   setPayDate]   = useState('')
  const [payCat,    setPayCat]    = useState('')
  const [payDesc,   setPayDesc]   = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const { confirm } = useConfirm()

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('scheduled_payments')
      .select('*')
      .order('due_date', { ascending: true })
    setRows(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { if (open) fetch() }, [open, fetch])

  // ── Form open ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditItem(null)
    setFDesc(''); setFAmount(''); setFDue(todayIso())
    setFMethod('check'); setFSupplier(''); setFNotes('')
    setFormOpen(true)
  }

  const openEdit = (p: ScheduledPayment) => {
    setEditItem(p)
    setFDesc(p.description); setFAmount(String(p.amount)); setFDue(p.due_date)
    setFMethod(p.payment_method); setFSupplier(p.supplier_id ?? ''); setFNotes(p.notes ?? '')
    setFormOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!fDesc || !fAmount || !fDue) return
    const amount = parseFloat(fAmount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(true)

    const payload = {
      tenant_id: tenantId,
      description: fDesc, amount, due_date: fDue,
      payment_method: fMethod,
      supplier_id: fSupplier || null,
      notes: fNotes || null,
    }

    const res = editItem
      ? await supabase.from('scheduled_payments').update(payload).eq('id', editItem.id)
      : await supabase.from('scheduled_payments').insert(payload)

    setSaving(false)
    if (res.error) { showToast('שגיאה: ' + res.error.message, 'error'); return }
    showToast(editItem ? 'עודכן' : 'נוסף', 'success')
    setFormOpen(false)
    fetch()
    onRefresh?.()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const del = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק תשלום מתוזמן זה?', icon: '🗑️' })
    if (!ok) return
    await supabase.from('scheduled_payments').delete().eq('id', id)
    showToast('נמחק', 'success')
    fetch()
    onRefresh?.()
  }

  // ── Mark as paid ───────────────────────────────────────────────────────────

  const openPay = (p: ScheduledPayment) => {
    setPayItem(p)
    setPayDate(p.due_date)
    setPayCat(p.category ?? expenseCats[0] ?? 'אחר')
    setPayDesc(p.description)
    setPayOpen(true)
  }

  const markPaid = async () => {
    if (!payItem || !payDate) return
    setPaySaving(true)

    // Create expense entry
    const expRes = await supabase.from('expenses').insert({
      tenant_id:   tenantId,
      date:        payDate,
      category:    payCat,
      description: payDesc || payItem.description,
      amount:      payItem.amount,
      supplier_id: payItem.supplier_id,
    }).select('id').single()

    if (expRes.error) { showToast('שגיאה ביצירת הוצאה: ' + expRes.error.message, 'error'); setPaySaving(false); return }

    // Mark payment as paid
    await supabase.from('scheduled_payments').update({
      is_paid: true, paid_date: payDate, expense_id: expRes.data.id,
    }).eq('id', payItem.id)

    setPaySaving(false)
    showToast('תשלום סומן כנפרע והוצאה נוצרה ✓', 'success')
    setPayOpen(false)
    fetch()
    onRefresh?.()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const unpaid  = rows.filter(r => !r.is_paid)
  const paid    = rows.filter(r => r.is_paid)
  const totalUnpaid = unpaid.reduce((s, r) => s + Number(r.amount), 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── List modal ───────────────────────────────────────────────────────── */}
      <Modal
        open={open && !formOpen && !payOpen}
        onClose={onClose}
        title="📅 תשלומים מתוזמנים"
        maxWidth={780}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {unpaid.length > 0 && (
                <>
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(totalUnpaid)}</span>
                  &nbsp;עתידי ל-{unpaid.length} תשלומים
                </>
              )}
            </div>
            <Button size="sm" onClick={openAdd}>+ הוסף תשלום</Button>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {Array(4).fill(0).map((_, i) => <div key={i} style={{ height: 44, background: '#f1f5f9', borderRadius: '8px' }} />)}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
              אין תשלומים מתוזמנים. לחץ &quot;+ הוסף תשלום&quot; כדי להתחיל.
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={TH}>תיאור</th>
                    <th style={TH}>סכום</th>
                    <th style={TH}>תאריך פירעון</th>
                    <th style={TH}>אמצעי</th>
                    <th style={TH}>ספק</th>
                    <th style={TH}>סטטוס</th>
                    <th style={{ ...TH, width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Unpaid first */}
                  {unpaid.map(p => {
                    const st = statusInfo(p)
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                      >
                        <td style={{ ...TD, fontWeight: 500 }}>
                          {p.description}
                          {p.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{p.notes}</div>}
                        </td>
                        <td style={{ ...TD, fontWeight: 700, color: 'var(--danger)' }}>{fmt(Number(p.amount))}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(p.due_date)}</td>
                        <td style={TD}>
                          <span style={{ fontSize: '12px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', borderRadius: '6px', padding: '2px 8px' }}>
                            {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-muted)' }}>
                          {suppliers.find(s => s.id === p.supplier_id)?.name || '—'}
                        </td>
                        <td style={TD}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: st.color, background: st.bg, borderRadius: '6px', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => openPay(p)}
                            title="סמן כנפרע"
                            style={{ ...ICON_BTN, fontSize: '13px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '6px', padding: '3px 8px', opacity: 1, fontWeight: 600 }}
                          >
                            ✓ שולם
                          </button>
                          <button onClick={() => openEdit(p)} style={ICON_BTN} title="עריכה">✏️</button>
                          <button onClick={() => del(p.id)}   style={ICON_BTN} title="מחיקה">🗑️</button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* Separator if there are paid rows */}
                  {paid.length > 0 && unpaid.length > 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '6px 14px', background: '#f8fafc', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        — שולמו —
                      </td>
                    </tr>
                  )}

                  {/* Paid rows */}
                  {paid.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: 0.55 }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.75'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.55'}
                    >
                      <td style={{ ...TD, textDecoration: 'line-through', color: 'var(--text-muted)' }}>{p.description}</td>
                      <td style={{ ...TD, fontWeight: 600, color: 'var(--text-muted)' }}>{fmt(Number(p.amount))}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(p.due_date)}</td>
                      <td style={TD}>
                        <span style={{ fontSize: '12px', background: '#f1f5f9', color: 'var(--text-muted)', borderRadius: '6px', padding: '2px 8px' }}>
                          {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                        </span>
                      </td>
                      <td style={{ ...TD, color: 'var(--text-muted)' }}>
                        {suppliers.find(s => s.id === p.supplier_id)?.name || '—'}
                      </td>
                      <td style={TD}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: '6px', padding: '3px 8px' }}>
                          שולם {p.paid_date ? fmtDate(p.paid_date) : ''}
                        </span>
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <button onClick={() => del(p.id)} style={ICON_BTN} title="מחיקה">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Add / Edit form modal ─────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editItem ? 'עריכת תשלום מתוזמן' : 'תשלום מתוזמן חדש'}
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={save} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="תיאור" placeholder="לדוג׳: צ'ק לספק, העברת שכירות..." value={fDesc} onChange={e => setFDesc(e.target.value)} />
          <Input label="סכום" type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} />
          <Input label="תאריך פירעון" type="date" value={fDue} onChange={e => setFDue(e.target.value)} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>אמצעי תשלום</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['check', 'transfer'] as const).map(m => (
                <button key={m} type="button" onClick={() => setFMethod(m)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                  border: `1px solid ${fMethod === m ? 'var(--primary)' : 'var(--border)'}`,
                  background: fMethod === m ? '#f0fdf4' : '#f8fafc',
                  color: fMethod === m ? 'var(--primary)' : 'var(--text-muted)',
                }}>
                  {m === 'check' ? "📝 צ'ק" : '🏦 העברה בנקאית'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>ספק (אופציונלי)</label>
            <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={SEL}>
              <option value="">— ללא ספק —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>הערות (אופציונלי)</label>
            <input
              type="text"
              placeholder="מספר צ'ק, פרטי העברה..."
              value={fNotes}
              onChange={e => setFNotes(e.target.value)}
              style={{ ...SEL }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Mark as paid modal ───────────────────────────────────────────────── */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="✓ סמן כנפרע"
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>ביטול</Button>
            <Button onClick={markPaid} loading={paySaving}>✅ אשר תשלום</Button>
          </>
        }
      >
        {payItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Payment summary */}
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{payItem.description}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{fmt(Number(payItem.amount))}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {payItem.payment_method === 'check' ? "צ'ק" : 'העברה בנקאית'} • פירעון {fmtDate(payItem.due_date)}
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#fef9ec', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
              ✨ תשלום זה יסומן כנפרע ותיווצר הוצאה בהתאם בדף ההוצאות.
            </div>

            <Input
              label="תאריך תשלום בפועל"
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>קטגוריה להוצאה</label>
              <select value={payCat} onChange={e => setPayCat(e.target.value)} style={SEL}>
                {expenseCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <Input
              label="תיאור ההוצאה"
              value={payDesc}
              onChange={e => setPayDesc(e.target.value)}
              placeholder={payItem.description}
            />
          </div>
        )}
      </Modal>
    </>
  )
}
