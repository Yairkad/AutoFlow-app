'use client'

import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import Button from '@/components/ui/Button'

export interface CustomerDebtCall {
  id: string
  customer_debt_id: string
  answered: boolean
  notes: string | null
  created_at: string
}

interface CallLogModalProps {
  open: boolean
  onClose: () => void
  debtId: string | null
  debtName: string
  calls: CustomerDebtCall[]
  tenantId: string
  supabase: SupabaseClient
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  onSaved: () => void
}

const fmtDT = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function CallLogModal({ open, onClose, debtId, debtName, calls, tenantId, supabase, showToast, onSaved }: CallLogModalProps) {
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open || !debtId) return null

  const reset = () => { setAnswered(null); setNotes('') }
  const close = () => { reset(); onClose() }

  const save = async () => {
    if (answered === null) { showToast('בחר האם ענה', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('customer_debt_calls').insert({
      tenant_id: tenantId,
      customer_debt_id: debtId,
      answered,
      notes: answered ? (notes.trim() || null) : null,
    })
    setSaving(false)
    if (error) { showToast('שגיאה בשמירת השיחה', 'error'); return }
    showToast('השיחה נרשמה ✓', 'success')
    reset()
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={close}>
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', maxWidth: '440px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700 }}>📞 מעקב שיחות — {debtName}</h3>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>רישום שיחה חדשה</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            onClick={() => setAnswered(true)}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${answered === true ? '#16a34a' : 'var(--border)'}`, background: answered === true ? '#f0fdf4' : '#fff', color: answered === true ? '#16a34a' : 'var(--text)' }}
          >✓ ענה</button>
          <button
            onClick={() => setAnswered(false)}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${answered === false ? 'var(--danger)' : 'var(--border)'}`, background: answered === false ? '#fef2f2' : '#fff', color: answered === false ? 'var(--danger)' : 'var(--text)' }}
          >✕ לא ענה</button>
        </div>

        {answered === true && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
            מה נאמר
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="סיכום השיחה..." rows={3} className="form-input" style={{ resize: 'vertical' }} />
          </label>
        )}

        <div className="sticky-actions" style={{ marginBottom: calls.length ? '16px' : 0 }}>
          <Button variant="secondary" onClick={close}>סגור</Button>
          <Button loading={saving} onClick={save}>💾 שמור שיחה</Button>
        </div>

        {calls.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>היסטוריית שיחות ({calls.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
              {[...calls].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(c => (
                <div key={c.id} style={{ padding: '8px 10px', background: 'var(--bg)', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: c.answered ? '#16a34a' : 'var(--danger)' }}>{c.answered ? '✓ ענה' : '✕ לא ענה'}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtDT(c.created_at)}</span>
                  </div>
                  {c.notes && <div style={{ marginTop: '4px', color: 'var(--text)' }}>{c.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
