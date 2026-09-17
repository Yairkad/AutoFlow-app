'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { BankSource } from './types'

const SEL: React.CSSProperties = {
  padding: '6px 10px', fontSize: '13px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

const PAYMENT_METHODS = ['מזומן', 'אשראי', "צ'ק", 'העברה']

interface Props {
  sources: BankSource[]
  onChanged: () => void
}

export default function SourcesTab({ sources, onChanged }: Props) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function updateSource(id: string, patch: Partial<BankSource>) {
    setBusyId(id)
    const { error } = await supabase.from('bank_statement_sources').update(patch).eq('id', id)
    setBusyId(null)
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return }
    onChanged()
  }

  async function deleteSource(source: BankSource) {
    const ok = await confirm({ msg: `למחוק את המקור "${source.name}"? ייבואים קודמים שנקשרו אליו יישארו, אך ללא מקור מקושר.`, icon: '🗑️' })
    if (!ok) return
    setBusyId(source.id)
    const { error } = await supabase.from('bank_statement_sources').delete().eq('id', source.id)
    setBusyId(null)
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return }
    showToast('נמחק', 'success')
    onChanged()
  }

  if (sources.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
      עדיין אין מקורות שמורים — מקור נשמר אוטומטית בפעם הראשונה שמייבאים ממנו קובץ, בטאב "ייבוא".
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {sources.map(s => (
        <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', opacity: busyId === s.id ? 0.6 : 1 }}>
          <span style={{ fontWeight: 700, fontSize: '14px', minWidth: 160 }}>{s.name}</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>טווח התאמה (ימים)</label>
            <input
              type="number" min={0} defaultValue={s.match_tolerance_days} style={{ ...SEL, width: 70 }}
              onBlur={e => {
                const v = Math.max(0, parseInt(e.target.value, 10) || 0)
                if (v !== s.match_tolerance_days) updateSource(s.id, { match_tolerance_days: v })
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>אמצעי תשלום ברירת מחדל</label>
            <select
              value={s.default_payment_method ?? ''}
              onChange={e => updateSource(s.id, { default_payment_method: e.target.value || null })}
              style={SEL}
            >
              <option value="">— ללא —</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <button
            onClick={() => deleteSource(s)}
            title="מחק מקור"
            style={{ marginRight: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '16px' }}
          >🗑️</button>
        </div>
      ))}
    </div>
  )
}
