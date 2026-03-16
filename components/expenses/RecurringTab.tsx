'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringExpense {
  id: string
  tenant_id: string
  description: string
  category: string
  amount: number | null
  is_variable: boolean
  supplier_id: string | null
  frequency: 'monthly' | 'bimonthly'
  is_active: boolean
  last_applied: string | null
}

interface Props {
  rows: RecurringExpense[]
  suppliers: { id: string; name: string }[]
  tenantId: string
  supabase: SupabaseClient
  onRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATS = ['דלק', 'שכר', 'חשמל', 'מים', 'שכירות', 'ביטוח', 'ציוד', 'ניקיון', 'אחזקה', 'קניות מלאי', 'אחר']

const FREQ_LABELS: Record<string, string> = {
  monthly:   'חודשי',
  bimonthly: 'דו-חודשי',
}

function fmt(n: number | null) {
  if (n == null) return 'משתנה'
  return '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TD: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', verticalAlign: 'middle', fontSize: '14px' }
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }
const SELECT: React.CSSProperties = { width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: '#fff', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecurringTab({ rows, suppliers, tenantId, supabase, onRefresh, showToast }: Props) {
  const [modal, setModal]     = useState(false)
  const [editItem, setEditItem] = useState<RecurringExpense | null>(null)
  const [saving, setSaving]   = useState(false)

  // Form
  const [fDesc,        setFDesc]        = useState('')
  const [fCat,         setFCat]         = useState(EXPENSE_CATS[0])
  const [fIsVariable,  setFIsVariable]  = useState(false)
  const [fAmount,      setFAmount]      = useState('')
  const [fFreq,        setFFreq]        = useState<'monthly' | 'bimonthly'>('monthly')
  const [fSupplier,    setFSupplier]    = useState('')
  const [fActive,      setFActive]      = useState(true)

  const { confirm } = useConfirm()

  const openAdd = () => {
    setEditItem(null)
    setFDesc(''); setFCat(EXPENSE_CATS[0]); setFIsVariable(false)
    setFAmount(''); setFFreq('monthly'); setFSupplier(''); setFActive(true)
    setModal(true)
  }

  const openEdit = (r: RecurringExpense) => {
    setEditItem(r)
    setFDesc(r.description)
    setFCat(r.category)
    setFIsVariable(r.is_variable)
    setFAmount(r.amount != null ? String(r.amount) : '')
    setFFreq(r.frequency)
    setFSupplier(r.supplier_id ?? '')
    setFActive(r.is_active)
    setModal(true)
  }

  const save = async () => {
    if (!fDesc) return
    if (!fIsVariable && (!fAmount || isNaN(parseFloat(fAmount)))) return
    setSaving(true)

    const payload = {
      tenant_id:   tenantId,
      description: fDesc,
      category:    fCat,
      is_variable: fIsVariable,
      amount:      fIsVariable ? null : parseFloat(fAmount),
      frequency:   fFreq,
      supplier_id: fSupplier || null,
      is_active:   fActive,
    }

    const res = editItem
      ? await supabase.from('recurring_expenses').update(payload).eq('id', editItem.id)
      : await supabase.from('recurring_expenses').insert(payload)

    setSaving(false)
    if (res.error) { showToast('שגיאה: ' + res.error.message, 'error'); return }
    showToast(editItem ? 'עודכן' : 'נוסף', 'success')
    setModal(false)
    onRefresh()
  }

  const del = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק הוצאה קבועה זו?', icon: '🗑️' })
    if (!ok) return
    await supabase.from('recurring_expenses').delete().eq('id', id)
    showToast('נמחק', 'success')
    onRefresh()
  }

  const toggleActive = async (r: RecurringExpense) => {
    await supabase.from('recurring_expenses').update({ is_active: !r.is_active }).eq('id', r.id)
    onRefresh()
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          הוצאות קבועות מתווספות אוטומטית מדי חודש. הוצאות משתנות שולחות תזכורת להזנת סכום.
        </p>
        <Button onClick={openAdd}>+ הוסף קבועה</Button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
              <th style={TH}>תיאור</th>
              <th style={TH}>קטגוריה</th>
              <th style={TH}>סכום</th>
              <th style={TH}>תדירות</th>
              <th style={TH}>ספק</th>
              <th style={TH}>יושם לאחרונה</th>
              <th style={TH}>פעיל</th>
              <th style={{ ...TH, width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  אין הוצאות קבועות. לחץ &quot;הוסף קבועה&quot; כדי להתחיל.
                </td>
              </tr>
            ) : rows.map(r => (
              <tr
                key={r.id}
                style={{ borderBottom: '1px solid var(--border)', opacity: r.is_active ? 1 : 0.5 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
              >
                <td style={{ ...TD, fontWeight: 500 }}>{r.description}</td>
                <td style={TD}>
                  <span style={{ background: '#f1f5f9', borderRadius: '6px', padding: '2px 8px', fontSize: '12px' }}>{r.category}</span>
                </td>
                <td style={{ ...TD, fontWeight: 700, color: r.is_variable ? 'var(--warning)' : 'var(--danger)' }}>
                  {fmt(r.amount)}
                </td>
                <td style={TD}>
                  <span style={{ background: r.frequency === 'bimonthly' ? '#fef3c7' : '#f0fdf4', color: r.frequency === 'bimonthly' ? 'var(--warning)' : 'var(--primary)', borderRadius: '6px', padding: '2px 8px', fontSize: '12px' }}>
                    {FREQ_LABELS[r.frequency]}
                  </span>
                </td>
                <td style={{ ...TD, color: 'var(--text-muted)' }}>
                  {suppliers.find(s => s.id === r.supplier_id)?.name || '—'}
                </td>
                <td style={{ ...TD, color: 'var(--text-muted)', fontSize: '12px' }}>
                  {r.last_applied ? r.last_applied : 'עוד לא'}
                </td>
                <td style={TD}>
                  <button
                    onClick={() => toggleActive(r)}
                    style={{
                      border: 'none', cursor: 'pointer',
                      background: r.is_active ? 'var(--primary)' : '#e2e8f0',
                      color: r.is_active ? '#fff' : 'var(--text-muted)',
                      borderRadius: '12px', padding: '2px 10px', fontSize: '12px',
                    }}
                  >
                    {r.is_active ? 'פעיל' : 'מושבת'}
                  </button>
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: '15px', opacity: 0.7 }}>✏️</button>
                  <button onClick={() => del(r.id)}   style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: '15px', opacity: 0.7 }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editItem ? 'עריכת הוצאה קבועה' : 'הוצאה קבועה חדשה'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>ביטול</Button>
            <Button onClick={save} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="תיאור" placeholder="לדוג׳: חשמל, שכירות..." value={fDesc} onChange={e => setFDesc(e.target.value)} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>קטגוריה</label>
            <select value={fCat} onChange={e => setFCat(e.target.value)} style={SELECT}>
              {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Variable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setFIsVariable(v => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                background: fIsVariable ? 'var(--warning)' : 'var(--primary)',
                position: 'relative', transition: 'background .2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 18, height: 18,
                borderRadius: '50%', background: '#fff',
                transition: 'right .2s',
                right: fIsVariable ? 2 : 20,
              }} />
            </button>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{fIsVariable ? 'סכום משתנה' : 'סכום קבוע'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {fIsVariable ? 'תתבקש להזין סכום בכל פעם (למשל: חשמל, מים)' : 'אותו סכום בכל חודש'}
              </div>
            </div>
          </div>

          {!fIsVariable && (
            <Input
              label="סכום"
              type="number"
              prefix="₪"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={fAmount}
              onChange={e => setFAmount(e.target.value)}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>תדירות</label>
            <select value={fFreq} onChange={e => setFFreq(e.target.value as 'monthly' | 'bimonthly')} style={SELECT}>
              <option value="monthly">חודשי – כל חודש</option>
              <option value="bimonthly">דו-חודשי – כל חודשיים (למשל: חשמל)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>ספק (אופציונלי)</label>
            <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={SELECT}>
              <option value="">— ללא ספק —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
