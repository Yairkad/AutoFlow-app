'use client'

import { useMemo, useState } from 'react'
import { tireSizeText } from '@/lib/tires/size'

// Pick an existing tire by size / brand / SKU. Used by the inventory count (add a tire without a
// barcode, link an unrecognised barcode) and the tires page (merge a duplicate into the right tire).

export interface PickableTire {
  id: string
  sku: string | null
  brand: string | null
  width: number | null
  profile: number | null
  rim: number | null
  qty: number
}

export default function TirePickerModal<T extends PickableTire>({ tires, title, subtitle, excludeId, onPick, onClose, children }: {
  tires: T[]
  title: string
  subtitle?: string
  excludeId?: string
  onPick: (t: T) => void
  onClose: () => void
  children?: React.ReactNode   // extra options shown above the list (e.g. a checkbox)
}) {
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '')
    return tires
      .filter(t => t.id !== excludeId)
      .filter(t => !s || [tireSizeText(t), tireSizeText(t, '/'), t.brand ?? '', t.sku ?? '']
        .some(v => v.toLowerCase().replace(/\s+/g, '').includes(s)))
      .slice(0, 40)
  }, [tires, q, excludeId])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{
        background: 'var(--bg-card)', borderRadius: 14, padding: 18, width: 'min(480px, 100%)', maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)', direction: 'rtl',
      }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>}
        <input className="form-input" autoFocus placeholder="חיפוש לפי מידה (205/55R16), מותג או מקט..." value={q}
          onChange={e => setQ(e.target.value)} style={{ margin: '12px 0 8px' }} />
        {children}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80 }}>
          {matches.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>לא נמצאו צמיגים</div>}
          {matches.map(t => (
            <button key={t.id} type="button" onClick={() => onPick(t)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'right',
              padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span>
                <strong style={{ color: 'var(--accent)', fontSize: 14 }}>{tireSizeText(t) || 'ללא מידה'}</strong>
                {t.brand && <span style={{ marginRight: 8, fontSize: 13 }}>{t.brand}</span>}
                {t.sku && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t.sku}</span>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>מלאי: {t.qty}</span>
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'left', marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>ביטול</button>
        </div>
      </div>
    </div>
  )
}
