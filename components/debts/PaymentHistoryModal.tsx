'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import Button from '@/components/ui/Button'
import { insertCustomerDebtPayment, updateCustomerDebtPayment, deleteCustomerDebtPayment } from '@/lib/debts/customerDebtPayments'

type PaymentMethod = 'מזומן' | 'אשראי' | "צ'ק" | 'העברה'

export interface CustomerDebtPayment {
  id: string; customer_debt_id: string; amount: number
  payment_date: string; payment_method: string; reference: string | null
  transfer_verified: boolean | null; verified_date: string | null
  receipt_issued: boolean; receipt_number: string | null; created_at: string
}

interface HistoryDebt {
  id: string; name: string; amount: number; paid: number; is_closed: boolean
}

interface PaymentHistoryModalProps {
  open: boolean
  onClose: () => void
  debt: HistoryDebt | null
  payments: CustomerDebtPayment[]
  tenantId: string
  supabase: SupabaseClient
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  onSaved: () => void
}

const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function PaymentHistoryModal({ open, onClose, debt, payments, tenantId, supabase, showToast, onSaved }: PaymentHistoryModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('מזומן')
  const [reference, setReference] = useState('')
  const [receiptIssued, setReceiptIssued] = useState(false)
  const [receiptNumber, setReceiptNumber] = useState('')
  const [saving, setSaving] = useState(false)

  const balance = debt ? Math.max(0, Number(debt.amount) - Number(debt.paid)) : 0

  const resetForm = () => {
    setEditingId(null)
    setAmount(balance > 0 ? balance.toFixed(2) : '')
    setDate(todayISO()); setMethod('מזומן'); setReference('')
    setReceiptIssued(false); setReceiptNumber('')
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) resetForm() }, [open, debt?.id])

  if (!open || !debt) return null

  const close = () => { resetForm(); onClose() }

  const startEdit = (p: CustomerDebtPayment) => {
    setEditingId(p.id)
    setAmount(String(p.amount))
    setDate(p.payment_date)
    setMethod(p.payment_method as PaymentMethod)
    setReference(p.reference ?? '')
    setReceiptIssued(p.receipt_issued)
    setReceiptNumber(p.receipt_number ?? '')
  }

  const save = async () => {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { showToast('סכום לא תקין', 'error'); return }
    setSaving(true)
    const meta = {
      amount: amt, payment_date: date, payment_method: method,
      reference: reference.trim() || null,
      receipt_issued: receiptIssued, receipt_number: receiptNumber.trim() || null,
    }
    if (editingId) {
      const { error } = await updateCustomerDebtPayment(supabase, editingId, debt.id, meta)
      setSaving(false)
      if (error) { showToast('שגיאה בעדכון התשלום', 'error'); return }
      showToast('התשלום עודכן ✓', 'success')
    } else {
      const { error, isClosed } = await insertCustomerDebtPayment(supabase, tenantId, debt.id, Number(debt.amount), meta)
      setSaving(false)
      if (error) { showToast('שגיאה בשמירת התשלום', 'error'); return }
      showToast(isClosed ? 'שולם במלואו ✓' : 'תשלום נרשם ✓', 'success')
    }
    resetForm()
    onSaved()
  }

  const remove = async (id: string) => {
    if (!confirm('למחוק תשלום זה?')) return
    const { error } = await deleteCustomerDebtPayment(supabase, id, debt.id)
    if (error) { showToast('שגיאה במחיקת התשלום', 'error'); return }
    showToast('נמחק', 'success')
    if (editingId === id) resetForm()
    onSaved()
  }

  const sorted = [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={close}>
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700 }}>📜 היסטוריית תשלומים — {debt.name}</h3>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <span>סכום חוב: <strong>{fmt(debt.amount)}</strong></span>
          <span>שולם: <strong style={{ color: '#16a34a' }}>{fmt(debt.paid)}</strong></span>
          <span>יתרה: <strong style={{ color: balance > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(balance)}</strong></span>
          {debt.is_closed && <span style={{ color: '#16a34a', fontWeight: 600 }}>סגור ✓</span>}
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{editingId ? '✏️ עריכת תשלום' : '+ הוספת תשלום'}</div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
            סכום תשלום (₪) *
            <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="form-input" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
            תאריך תשלום
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
          </label>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600 }}>אמצעי תשלום</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
              {(['מזומן', 'אשראי', 'העברה', "צ'ק"] as PaymentMethod[]).map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)} style={{
                  padding: '7px 4px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                  border: `1px solid ${method === m ? 'var(--primary)' : 'var(--border)'}`,
                  background: method === m ? '#f0fdf4' : '#f8fafc',
                  color: method === m ? 'var(--primary)' : 'var(--text-muted)',
                }}>
                  {m === 'מזומן' ? '💵' : m === 'אשראי' ? '💳' : m === "צ'ק" ? '📝' : '🏦'} {m}
                </button>
              ))}
            </div>
            {(method === 'העברה' || method === "צ'ק") && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, marginTop: '8px' }}>
                {method === 'העברה' ? 'מספר אסמכתא' : 'מספר צ׳ק'}
                <input value={reference} onChange={e => setReference(e.target.value)} placeholder="אופציונלי" className="form-input" style={{ margin: 0 }} />
              </label>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={receiptIssued} onChange={e => setReceiptIssued(e.target.checked)} />
            🧾 הופקה קבלה
          </label>
          {receiptIssued && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
              מספר קבלה
              <input value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="מספר קבלה..." className="form-input" style={{ margin: 0 }} />
            </label>
          )}
        </div>

        <div className="sticky-actions" style={{ marginBottom: payments.length ? '16px' : 0 }}>
          {editingId && <Button variant="secondary" onClick={resetForm}>ביטול עריכה</Button>}
          <Button variant="secondary" onClick={close}>סגור</Button>
          <Button loading={saving} onClick={save} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
            💾 {editingId ? 'שמור שינויים' : 'שמור תשלום'}
          </Button>
        </div>

        {payments.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>היסטוריה ({payments.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
              {sorted.map(p => (
                <div key={p.id} style={{ padding: '8px 10px', background: editingId === p.id ? '#f0fdf4' : 'var(--bg)', borderRadius: '8px', fontSize: '12px', border: editingId === p.id ? '1px solid var(--primary)' : '1px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{p.payment_date}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{p.payment_method}</span>
                    <div style={{ marginRight: 'auto', display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(p)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13 }} title="ערוך">✏️</button>
                      <button onClick={() => remove(p.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13 }} title="מחק">🗑</button>
                    </div>
                  </div>
                  {(p.reference || p.receipt_issued || p.payment_method === 'העברה') && (
                    <div style={{ marginTop: '4px', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {p.reference && <span>אסמכתא: {p.reference}</span>}
                      {p.receipt_issued && <span>🧾 קבלה{p.receipt_number ? ` #${p.receipt_number}` : ''}</span>}
                      {p.payment_method === 'העברה' && (
                        <span style={{ color: p.transfer_verified ? '#16a34a' : 'var(--warning)' }}>
                          {p.transfer_verified ? '✓ ההעברה אומתה' : 'ממתין לאימות העברה'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
