'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { quickCreateExpense, quickCreateIncome, QuickCreatedRow } from '@/lib/expenses/quickCreateExpense'

const LAST_CATEGORY_KEY = 'quickExpense.lastCategory'

const SEL: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: '14px',
  border: '1.5px solid var(--border)', borderRadius: '9px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  categories: string[]
  direction?: 'expense' | 'income'
  defaultPaymentMethod?: string
  prefill?: { date?: string; description?: string; amount?: number }
  onSaved: (row: QuickCreatedRow) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// Minimal-field quick-capture modal: date + category + description + amount
// only -- no payment method / supplier / amortize / recurring pickers, since
// the goal is fast repeated entry for small receipts (fuel, local purchases)
// as they happen through the month. See lib/expenses/quickCreateExpense.ts
// for the shared write path also used by the bank-sync reconciliation screen.
export default function QuickExpenseModal({
  open, onClose, tenantId, categories, direction = 'expense',
  defaultPaymentMethod, prefill, onSaved,
}: Props) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()

  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(prefill?.date ?? todayISO())
    setDescription(prefill?.description ?? '')
    setAmount(prefill?.amount != null ? String(prefill.amount) : '')
    const lastCat = typeof window !== 'undefined' ? localStorage.getItem(LAST_CATEGORY_KEY) : null
    setCategory(lastCat && categories.includes(lastCat) ? lastCat : (categories[0] ?? ''))
  }, [open, prefill, categories])

  const save = async () => {
    const amt = parseFloat(amount)
    if (!category || !amt || amt <= 0) { showToast('נא למלא קטגוריה וסכום', 'error'); return }
    if (!tenantId) { showToast('הפרופיל עדיין נטען, נסה שוב בעוד רגע', 'error'); return }
    setSaving(true)
    const create = direction === 'expense' ? quickCreateExpense : quickCreateIncome
    const { data, error } = await create(supabase, {
      tenantId, date, category, description: description.trim(), amount: amt,
      paymentMethod: defaultPaymentMethod,
    })
    setSaving(false)
    if (error || !data) { showToast('שגיאה: ' + (error ?? ''), 'error'); return }
    try { localStorage.setItem(LAST_CATEGORY_KEY, category) } catch {}
    showToast(direction === 'expense' ? 'הוצאה נוספה ✓' : 'הכנסה נוספה ✓', 'success')
    onSaved(data)
    // Reset for the next rapid entry instead of closing -- keeps the flow fast
    setDescription('')
    setAmount('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={direction === 'expense' ? '⚡ הוספה מהירה — הוצאה' : '⚡ הוספה מהירה — הכנסה'}
      maxWidth={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>סגור</Button>
          <Button onClick={save} loading={saving}>💾 שמור והמשך</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500 }}>תאריך</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={SEL} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500 }}>קטגוריה</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={SEL} autoFocus={!prefill}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input
          label="תיאור / ספק"
          placeholder="לדוגמה: תדלוק, סופר..."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <Input
          label="סכום"
          type="number"
          prefix="₪"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          autoFocus={!!prefill}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
        />
      </div>
    </Modal>
  )
}
