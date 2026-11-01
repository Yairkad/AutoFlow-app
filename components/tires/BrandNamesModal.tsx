'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { BrandName } from '@/lib/tires/brands'

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  /** Brands as written on the tires */
  brands: string[]
  saved: BrandName[]
  onSaved: () => void
  showToast: (msg: string, kind: 'success' | 'error') => void
}

const norm = (s: string) => s.trim().toLowerCase()

// One Hebrew name per brand (Michelin = מישלן) — applies to every tire of that brand.
export default function BrandNamesModal({ open, onClose, tenantId, brands, saved, onSaved, showToast }: Props) {
  const initial = () => Object.fromEntries(brands.map(b => [b, saved.find(s => norm(s.name_en) === norm(b))?.name_he ?? '']))
  const [names, setNames] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  async function save() {
    setSaving(true)
    const sb = createClient()
    const changed = brands.filter(b => (names[b] ?? '').trim() !== (saved.find(s => norm(s.name_en) === norm(b))?.name_he ?? ''))
    const upserts = changed.filter(b => names[b]?.trim()).map(b => ({ tenant_id: tenantId, name_en: b, name_he: names[b].trim() }))
    const removed = changed.filter(b => !names[b]?.trim())
    // Unique index is on lower(name_en), so replace rows instead of relying on upsert conflict targets
    const toDelete = [...upserts.map(u => u.name_en), ...removed]
    let error = null
    for (const b of toDelete) {
      const r = await sb.from('tire_brands').delete().eq('tenant_id', tenantId).ilike('name_en', b.replace(/[%_\\]/g, '\\$&'))
      error = error ?? r.error
    }
    if (upserts.length) error = error ?? (await sb.from('tire_brands').insert(upserts)).error
    setSaving(false)
    if (error) { console.error('[tires] brand names', error); showToast('שגיאה בשמירה', 'error'); return }
    showToast('נשמר ✓', 'success')
    onSaved(); onClose()
  }

  const shown = brands.filter(b => !filter.trim() || norm(b).includes(norm(filter)) || (names[b] ?? '').includes(filter.trim()))

  return (
    <Modal open={open} onClose={onClose} title="🔤 שמות חברות בעברית" maxWidth={520}
      footer={<>
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
        <Button loading={saving} onClick={save}>שמור</Button>
      </>}>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        שם אחד לכל חברה — חל על כל הצמיגים שלה. אפשר לחפש בעברית ובאנגלית, והתצוגה בעברית עם האנגלית מתחת.
      </p>
      <input className="form-input" aria-label="חיפוש חברה" placeholder="חיפוש חברה..." value={filter}
        onChange={e => setFilter(e.target.value)} style={{ marginBottom: '10px', width: '100%' }} />
      {brands.length === 0 && <p style={{ color: 'var(--text-muted)' }}>אין עדיין צמיגים עם שם חברה</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {shown.map(b => (
          <label key={b} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center', fontSize: '14px' }}>
            <span dir="ltr" style={{ textAlign: 'right', fontWeight: 600 }}>{b}</span>
            <input className="form-input" placeholder="שם בעברית" value={names[b] ?? ''}
              onChange={e => setNames(n => ({ ...n, [b]: e.target.value }))} />
          </label>
        ))}
      </div>
    </Modal>
  )
}
