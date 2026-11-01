'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { keyOf, type BrandName } from '@/lib/tires/brands'

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  /** tires.brand of every tire (with repeats — used to pick the most common spelling) */
  tireBrands: (string | null)[]
  saved: BrandName[]
  onSaved: () => void | Promise<void>
  showToast: (msg: string, kind: 'success' | 'error') => void
}

interface Group {
  key: string
  /** Most common spelling — the one kept when unifying */
  main: string
  /** Every spelling on the tires, with tire count */
  variants: { name: string; count: number }[]
  total: number
}

// One Hebrew name per brand (Michelin = מישלן) — applies to every tire of that brand.
// Spellings that differ only in case/spaces/dots ("MICHELIN", "michelin ") are one group,
// so they get one row (unique index is on lower(name_en) — two rows of the same brand = 409).
export default function BrandNamesModal({ open, onClose, tenantId, tireBrands, saved, onSaved, showToast }: Props) {
  const { confirm } = useConfirm()
  const [names, setNames] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [mergeKey, setMergeKey] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')

  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Map<string, number>>()
    for (const raw of tireBrands) {
      const b = raw?.trim()
      if (!b) continue
      const k = keyOf(b)
      if (!k) continue
      const m = byKey.get(k) ?? new Map<string, number>()
      m.set(b, (m.get(b) ?? 0) + 1)
      byKey.set(k, m)
    }
    return [...byKey.entries()].map(([key, m]) => {
      const variants = [...m.entries()].map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      return { key, main: variants[0].name, variants, total: variants.reduce((s, v) => s + v.count, 0) }
    }).sort((a, b) => a.main.localeCompare(b.main))
  }, [tireBrands])

  const savedHe = (key: string) => saved.find(s => keyOf(s.name_en) === key)?.name_he ?? ''
  const heOf = (key: string) => names[key] ?? savedHe(key)
  const savedRowsOf = (key: string) => saved.filter(s => keyOf(s.name_en) === key).map(s => s.name_en)

  async function save() {
    setSaving(true)
    const sb = createClient()
    const changed = groups.filter(g => names[g.key] !== undefined && names[g.key].trim() !== savedHe(g.key))
    let error = null
    for (const g of changed) {
      const old = savedRowsOf(g.key)
      if (old.length) error = error ?? (await sb.from('tire_brands').delete().eq('tenant_id', tenantId).in('name_en', old)).error
    }
    const inserts = changed.filter(g => names[g.key].trim()).map(g => ({ tenant_id: tenantId, name_en: g.main, name_he: names[g.key].trim() }))
    if (inserts.length) error = error ?? (await sb.from('tire_brands').insert(inserts)).error
    setSaving(false)
    if (error) { console.error('[tires] brand names', error); showToast('שגיאה בשמירה', 'error'); return }
    showToast('נשמר ✓', 'success')
    await onSaved(); onClose()
  }

  /** Rename every tire of `from` spellings to `to`, and move the Hebrew name to the kept brand */
  async function renameTires(fromNames: string[], to: string, fromKey: string, toKey: string) {
    const sb = createClient()
    const from = fromNames.filter(n => n !== to)
    if (from.length) {
      const { error } = await sb.from('tires').update({ brand: to }).eq('tenant_id', tenantId).in('brand', from)
      if (error) return error
      // Suppliers' brand lists (suppliers.brands) hold the same spellings
      const { data: supps } = await sb.from('suppliers').select('id, brands').eq('tenant_id', tenantId).overlaps('brands', from)
      for (const sp of (supps ?? []) as { id: string; brands: string[] }[]) {
        const next = [...new Set(sp.brands.map(b => from.includes(b) ? to : b))]
        const { error: e2 } = await sb.from('suppliers').update({ brands: next }).eq('id', sp.id)
        if (e2) return e2
      }
    }
    // Hebrew name: keep the target's; if it has none, take the merged one
    const he = (names[toKey] ?? savedHe(toKey)).trim() || (names[fromKey] ?? savedHe(fromKey)).trim()
    const old = [...new Set([...savedRowsOf(fromKey), ...savedRowsOf(toKey)])]
    if (old.length) {
      const { error } = await sb.from('tire_brands').delete().eq('tenant_id', tenantId).in('name_en', old)
      if (error) return error
    }
    if (he) {
      const { error } = await sb.from('tire_brands').insert({ tenant_id: tenantId, name_en: to, name_he: he })
      if (error) return error
    }
    return null
  }

  async function unify(g: Group) {
    const ok = await confirm({ msg: `לאחד את כל הכתיבים ל-"${g.main}"?\n${g.variants.map(v => `${v.name} (${v.count})`).join(', ')}` })
    if (!ok) return
    setBusy(g.key)
    const error = await renameTires(g.variants.map(v => v.name), g.main, g.key, g.key)
    setBusy(null)
    if (error) { console.error('[tires] unify brand', error); showToast('שגיאה באיחוד', 'error'); return }
    showToast(`אוחד ל-${g.main} ✓`, 'success')
    await onSaved()
  }

  async function mergeInto(src: Group) {
    const target = groups.find(g => g.key === mergeTarget)
    if (!target) return
    const ok = await confirm({ msg: `למזג את "${src.main}" (${src.total} צמיגים) לתוך "${target.main}"?\nכל הצמיגים של ${src.main} יעברו לשם ${target.main}.` })
    if (!ok) return
    setBusy(src.key)
    const error = await renameTires(src.variants.map(v => v.name), target.main, src.key, target.key)
    setBusy(null)
    if (error) { console.error('[tires] merge brand', error); showToast('שגיאה במיזוג', 'error'); return }
    setMergeKey(null); setMergeTarget('')
    setNames(n => { const c = { ...n }; delete c[src.key]; return c })
    showToast(`מוזג לתוך ${target.main} ✓`, 'success')
    await onSaved()
  }

  const f = filter.trim().toLowerCase()
  const shown = groups.filter(g => !f || g.variants.some(v => v.name.toLowerCase().includes(f)) || heOf(g.key).includes(filter.trim()))
  const dupCount = groups.filter(g => g.variants.length > 1).length

  return (
    <Modal open={open} onClose={onClose} title="🔤 שמות חברות בעברית" maxWidth={620}
      footer={<>
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
        <Button loading={saving} onClick={save}>שמור</Button>
      </>}>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        שם אחד לכל חברה — חל על כל הצמיגים שלה. כתיבים שונים של אותה חברה (אותיות גדולות/קטנות, רווחים) מוצגים יחד —
        &quot;איחוד&quot; משנה את כולם לכתיב אחד. לטעות כתיב (אות חסרה) — &quot;מזג לחברה אחרת&quot;.
      </p>
      {dupCount > 0 && (
        <div style={{ fontSize: '13px', background: 'var(--warning-bg, #fff7e0)', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
          ⚠️ {dupCount} חברות כתובות ביותר מכתיב אחד
        </div>
      )}
      <input className="form-input" aria-label="חיפוש חברה" placeholder="חיפוש חברה..." value={filter}
        onChange={e => setFilter(e.target.value)} style={{ marginBottom: '10px', width: '100%' }} />
      {groups.length === 0 && <p style={{ color: 'var(--text-muted)' }}>אין עדיין צמיגים עם שם חברה</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {shown.map(g => (
          <div key={g.key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
              <div dir="ltr" style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 600 }}>{g.main}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> · {g.total}</span>
              </div>
              <input className="form-input" placeholder="שם בעברית" aria-label={`שם בעברית ל-${g.main}`} value={heOf(g.key)}
                onChange={e => setNames(n => ({ ...n, [g.key]: e.target.value }))} />
              <Button size="sm" variant="secondary" disabled={busy === g.key}
                onClick={() => { setMergeKey(mergeKey === g.key ? null : g.key); setMergeTarget('') }}>🔗</Button>
            </div>
            {g.variants.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span dir="ltr">{g.variants.map(v => `${v.name} (${v.count})`).join(' · ')}</span>
                <Button size="sm" loading={busy === g.key} onClick={() => unify(g)}>איחוד ל-{g.main}</Button>
              </div>
            )}
            {mergeKey === g.key && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13 }}>
                <span>מזג לתוך:</span>
                <select className="form-input" style={{ flex: 1 }} value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} aria-label="חברה למיזוג">
                  <option value="">בחר חברה...</option>
                  {groups.filter(o => o.key !== g.key).map(o => (
                    <option key={o.key} value={o.key}>{o.main}{heOf(o.key) ? ` — ${heOf(o.key)}` : ''} ({o.total})</option>
                  ))}
                </select>
                <Button size="sm" disabled={!mergeTarget} loading={busy === g.key} onClick={() => mergeInto(g)}>מזג</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
