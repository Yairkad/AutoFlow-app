'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { fuzzyIncludes } from '@/lib/search/fuzzy'
import { parseTireSize, tireSizeText } from '@/lib/tires/size'
import type { ArrivalInput } from '@/app/api/stock/invoice-items/route'
import { brandHe, brandMap, brandSearchText, type BrandMap } from '@/lib/tires/brands'

/** A line being typed in "מה הגיע?" (kept on the invoice line until the invoice is saved) */
export interface ArrivalDraft {
  key: string
  item_type: 'tire' | 'product'
  text: string              // "מישלן 205/55R16" / product name
  ref_id: string | null     // picked existing item
  qty: string
  unit_cost: string
}

/** A line already saved on the invoice (stock was added) */
export interface SavedArrival {
  id: string; debt_id: string; item_type: 'tire' | 'product'; description: string; qty: number; unit_cost: number | null
}

export const emptyArrival = (): ArrivalDraft =>
  ({ key: crypto.randomUUID(), item_type: 'tire', text: '', ref_id: null, qty: '1', unit_cost: '' })

/** Draft lines → API payload (tire size / brand parsed from the free text) */
export function toArrivalInputs(drafts: ArrivalDraft[]): ArrivalInput[] {
  return drafts.filter(d => d.text.trim() && Number(d.qty) > 0).map(d => {
    const base = { item_type: d.item_type, ref_id: d.ref_id, description: d.text.trim(), qty: Math.round(Number(d.qty)), unit_cost: Number(d.unit_cost) || null }
    if (d.item_type === 'product') return { ...base, name: d.text.trim() }
    const size = parseTireSize(d.text)
    const brand = size ? d.text.replace(/\d{3}\s*[/\s-]\s*\d{2}\s*(?:z?r|\/|\s|-)?\s*\d{2}/i, '').trim() : d.text.trim()
    return { ...base, brand: brand || null, width: size?.width ?? null, profile: size?.profile ?? null, rim: size?.rim ?? null }
  })
}

interface TireRow { id: string; brand: string | null; width: number | null; profile: number | null; rim: number | null; qty: number }
interface ProdRow { id: string; name: string; sku: string | null; qty: number }

interface Props {
  open: boolean
  onClose: () => void
  title: string
  drafts: ArrivalDraft[]
  onDraftsChange: (d: ArrivalDraft[]) => void
  saved?: SavedArrival[]
  onDeleteSaved?: (id: string) => void
  /** View only (from the invoice list): no new lines */
  readOnly?: boolean
}

export default function ArrivalsModal({ open, onClose, title, drafts, onDraftsChange, saved = [], onDeleteSaved, readOnly }: Props) {
  const [tires, setTires] = useState<TireRow[]>([])
  const [prods, setProds] = useState<ProdRow[]>([])
  const [brands, setBrands] = useState<BrandMap>(new Map())
  const [focus, setFocus] = useState<string | null>(null)   // draft key showing suggestions

  useEffect(() => {
    if (!open || readOnly) return
    const sb = createClient()
    Promise.all([
      sb.from('tires').select('id, brand, width, profile, rim, qty').limit(5000),
      sb.from('products').select('id, name, sku, qty').limit(5000),
      sb.from('tire_brands').select('name_en, name_he'),
    ]).then(([t, p, b]) => { setTires(t.data ?? []); setProds(p.data ?? []); setBrands(brandMap(b.data)) })
  }, [open, readOnly])

  const set = (key: string, patch: Partial<ArrivalDraft>) =>
    onDraftsChange(drafts.map(d => d.key === key ? { ...d, ...patch } : d))

  function suggestions(d: ArrivalDraft): { id: string; label: string }[] {
    const q = d.text.trim()
    if (q.length < 2) return []
    if (d.item_type === 'product') {
      return prods.filter(p => fuzzyIncludes(`${p.name} ${p.sku ?? ''}`, q)).slice(0, 8)
        .map(p => ({ id: p.id, label: `${p.name} · מלאי ${p.qty}` }))
    }
    const size = parseTireSize(q)
    const words = q.replace(/\d{3}\s*[/\s-]\s*\d{2}\s*(?:z?r|\/|\s|-)?\s*\d{2}/i, '').trim()
    return tires
      .filter(t => (!size || (t.width === size.width && t.profile === size.profile && t.rim === size.rim))
        && (!words || fuzzyIncludes(brandSearchText(brands, t.brand), words)) && (size || words))
      .slice(0, 8)
      .map(t => ({ id: t.id, label: `${brandHe(brands, t.brand) ?? t.brand ?? ''} ${tireSizeText(t) || 'ללא מידה'} · מלאי ${t.qty}`.trim() }))
  }

  const total = [...saved.map(s => s.qty * (s.unit_cost ?? 0)), ...drafts.map(d => (Number(d.qty) || 0) * (Number(d.unit_cost) || 0))]
    .reduce((a, b) => a + b, 0)

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={720} guard={false}
      footer={<Button onClick={onClose}>{readOnly ? 'סגור' : '✓ סיום'}</Button>}>
      {saved.length > 0 && (
        <section aria-label="נקלט כבר" style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>✓ נקלט למלאי</div>
          {saved.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '4px', fontSize: '13px' }}>
              <span aria-hidden="true">{s.item_type === 'tire' ? '🏁' : '📦'}</span>
              <span style={{ flex: 1 }}>{s.description}</span>
              <span>× {s.qty}</span>
              {s.unit_cost != null && <span style={{ color: 'var(--text-muted)' }}>₪{s.unit_cost}</span>}
              {onDeleteSaved && (
                <button type="button" aria-label={`הסר ${s.description} (יוריד מהמלאי)`} title="הסר — יוריד את הכמות מהמלאי"
                  onClick={() => onDeleteSaved(s.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '14px' }}>🗑</button>
              )}
            </div>
          ))}
        </section>
      )}

      {!readOnly && (
        <>
          {drafts.length > 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              ייכנס למלאי כשהחשבונית נשמרת. מחיר הקנייה מהחשבונית מתעדכן אצל הפריט.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {drafts.map(d => {
              const sugg = focus === d.key && !d.ref_id ? suggestions(d) : []
              return (
                <div key={d.key} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                    {(['tire', 'product'] as const).map(t => (
                      <button key={t} type="button" aria-pressed={d.item_type === t}
                        onClick={() => set(d.key, { item_type: t, ref_id: null })}
                        style={{ padding: '7px 10px', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                          background: d.item_type === t ? 'var(--primary)' : 'transparent', color: d.item_type === t ? '#fff' : 'var(--text)' }}>
                        {t === 'tire' ? 'צמיג' : 'מוצר'}
                      </button>
                    ))}
                  </div>
                  <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
                    <input className="form-input" aria-label="פריט"
                      placeholder={d.item_type === 'tire' ? 'חברה ומידה — מישלן 205/55/16' : 'שם המוצר'}
                      value={d.text}
                      onFocus={() => setFocus(d.key)}
                      onBlur={() => setTimeout(() => setFocus(f => f === d.key ? null : f), 150)}
                      onChange={e => set(d.key, { text: e.target.value, ref_id: null })}
                      style={{ width: '100%', borderColor: d.ref_id ? '#16a34a' : undefined }} />
                    {d.ref_id && <span style={{ fontSize: '11px', color: '#16a34a' }}>✓ פריט קיים</span>}
                    {!d.ref_id && d.text.trim().length >= 2 && focus !== d.key && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>אם לא קיים — ייווצר חדש</span>
                    )}
                    {sugg.length > 0 && (
                      <ul style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20, margin: 0, padding: 0, listStyle: 'none',
                        background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                        {sugg.map(s => (
                          <li key={s.id}>
                            <button type="button" onMouseDown={e => { e.preventDefault(); set(d.key, { ref_id: s.id, text: s.label.replace(/ · מלאי \d+$/, '') }); setFocus(null) }}
                              style={{ width: '100%', textAlign: 'right', padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px' }}>
                              {s.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <input className="form-input" type="number" min="1" aria-label="כמות" placeholder="כמות"
                    value={d.qty} onChange={e => set(d.key, { qty: e.target.value })} style={{ width: '70px' }} />
                  <input className="form-input" type="number" min="0" step="0.01" aria-label="מחיר ליחידה" placeholder="₪ ליח׳"
                    value={d.unit_cost} onChange={e => set(d.key, { unit_cost: e.target.value })} style={{ width: '90px' }} />
                  <button type="button" aria-label="הסר שורה" onClick={() => onDraftsChange(drafts.filter(x => x.key !== d.key))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '16px', padding: '6px' }}>✕</button>
                </div>
              )
            })}
          </div>
          <button type="button" onClick={() => onDraftsChange([...drafts, emptyArrival()])}
            style={{ marginTop: '10px', border: '1px dashed var(--border)', background: 'none', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
            + פריט
          </button>
        </>
      )}

      {total > 0 && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          סה״כ לפי הפריטים: <strong style={{ color: 'var(--text)' }}>₪{total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong> (להשוואה מול סכום החשבונית)
        </div>
      )}
    </Modal>
  )
}
