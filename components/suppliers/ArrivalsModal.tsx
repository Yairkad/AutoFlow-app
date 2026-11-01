'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { fuzzyIncludes } from '@/lib/search/fuzzy'
import { parseTireSize, tireSizeText } from '@/lib/tires/size'
import type { ArrivalInput } from '@/app/api/stock/invoice-items/route'
import { brandHe, brandMap, brandSearchText, sameBrand, type BrandMap } from '@/lib/tires/brands'
import { useProfile } from '@/lib/contexts/ProfileContext'

// Size typed so far: "195/55" (no rim yet) already narrows the list
const SIZE_RE = /(\d{3})\s*[/\s-]\s*(\d{2})(?:\s*(?:z?r|\/|\s|-)?\s*(\d{2}))?/i
function partialSize(q: string) {
  const m = q.match(SIZE_RE)
  return m ? { width: +m[1], profile: +m[2], rim: m[3] ? +m[3] : null, rest: q.replace(m[0], '').trim() } : null
}

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
interface ProdRow { id: string; name: string; sku: string | null; qty: number; supplier_id?: string | null }
type Sugg = { id: string; label: string; other?: boolean }
type NewItem = { key: string; type: 'tire' | 'product'; brand: string; width: string; profile: string; rim: string; load_idx: string; speed_idx: string; name: string; sku: string; sell_price: string }

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
  /** The invoice's supplier: its brands / products are suggested first */
  supplierId?: string | null
}

export default function ArrivalsModal({ open, onClose, title, drafts, onDraftsChange, saved = [], onDeleteSaved, readOnly, supplierId }: Props) {
  const { profile } = useProfile()
  const [tires, setTires] = useState<TireRow[]>([])
  const [prods, setProds] = useState<ProdRow[]>([])
  const [brands, setBrands] = useState<BrandMap>(new Map())
  const [suppBrands, setSuppBrands] = useState<string[]>([])  // what this supplier brings
  const [focus, setFocus] = useState<string | null>(null)   // draft key showing suggestions
  const [wide, setWide] = useState<Set<string>>(new Set())  // drafts showing other suppliers' items too
  const [newItem, setNewItem] = useState<NewItem | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open || readOnly) return
    const sb = createClient()
    Promise.all([
      sb.from('tires').select('id, brand, width, profile, rim, qty').limit(5000),
      sb.from('products').select('id, name, sku, qty, supplier_id').limit(5000),
      sb.from('tire_brands').select('name_en, name_he'),
      supplierId ? sb.from('suppliers').select('*').eq('id', supplierId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([t, p, b, s]) => {
      setTires(t.data ?? []); setProds(p.data ?? []); setBrands(brandMap(b.data))
      setSuppBrands(Array.isArray(s.data?.brands) ? s.data.brands : [])
    })
  }, [open, readOnly, supplierId])

  const isSupplierBrand = (brand: string | null) => suppBrands.some(sb => sameBrand(brands, sb, brand))

  const set = (key: string, patch: Partial<ArrivalDraft>) =>
    onDraftsChange(drafts.map(d => d.key === key ? { ...d, ...patch } : d))

  // Suggestions: this supplier's brands / products first (only those, until "show others");
  // the last option is always "a new item that isn't in stock yet"
  function suggestions(d: ArrivalDraft): { list: Sugg[]; hidden: number } {
    const q = d.text.trim()
    if (q.length < 2) return { list: [], hidden: 0 }
    const showAll = wide.has(d.key)
    if (d.item_type === 'product') {
      const hits = prods.filter(p => fuzzyIncludes(`${p.name} ${p.sku ?? ''}`, q))
      const mine = supplierId ? hits.filter(p => p.supplier_id === supplierId) : hits
      const others = supplierId ? hits.filter(p => p.supplier_id !== supplierId) : []
      const shown = [...mine, ...(showAll || !mine.length ? others : [])].slice(0, 10)
      return { list: shown.map(p => ({ id: p.id, label: `${p.name} · מלאי ${p.qty}`, other: !!supplierId && p.supplier_id !== supplierId })),
        hidden: showAll || !mine.length ? 0 : others.length }
    }
    const size = partialSize(q)
    const words = size ? size.rest : q
    const hits = tires.filter(t =>
      (!size || (t.width === size.width && t.profile === size.profile && (size.rim == null || t.rim === size.rim)))
      && (!words || fuzzyIncludes(brandSearchText(brands, t.brand), words)))
      .sort((a, b) => (a.rim ?? 0) - (b.rim ?? 0) || (b.qty ?? 0) - (a.qty ?? 0))
    const mine = suppBrands.length ? hits.filter(t => isSupplierBrand(t.brand)) : hits
    const others = suppBrands.length ? hits.filter(t => !isSupplierBrand(t.brand)) : []
    const shown = [...mine, ...(showAll || !mine.length ? others : [])].slice(0, 12)
    return {
      list: shown.map(t => ({ id: t.id, other: suppBrands.length > 0 && !isSupplierBrand(t.brand),
        label: `${brandHe(brands, t.brand) ?? t.brand ?? ''} ${tireSizeText(t) || 'ללא מידה'} · מלאי ${t.qty}`.trim() })),
      hidden: showAll || !mine.length ? 0 : others.length,
    }
  }

  function openNew(d: ArrivalDraft) {
    const size = partialSize(d.text)
    const brand = (size ? size.rest : d.text).trim() || (suppBrands.length === 1 ? suppBrands[0] : '')
    setNewItem({ key: d.key, type: d.item_type, brand, width: size ? String(size.width) : '', profile: size ? String(size.profile) : '',
      rim: size?.rim ? String(size.rim) : '', load_idx: '', speed_idx: '', name: d.item_type === 'product' ? d.text.trim() : '', sku: '', sell_price: '' })
    setFocus(null)
  }

  // Create the item (qty 0 — the invoice line adds the stock when it is saved) and pick it
  async function createNew() {
    if (!newItem || !profile?.tenantId) return
    const n = newItem
    if (n.type === 'tire' && !(n.width && n.profile && n.rim)) return
    if (n.type === 'product' && !n.name.trim()) return
    setCreating(true)
    const sb = createClient()
    const price = Number(n.sell_price) || null
    const row = n.type === 'tire'
      ? { tenant_id: profile.tenantId, brand: n.brand.trim() || null, width: +n.width, profile: +n.profile, rim: +n.rim,
          load_idx: n.load_idx.trim() || null, speed_idx: n.speed_idx.trim() || null, sell_price: price, qty: 0, supplier_id: supplierId ?? null }
      : { tenant_id: profile.tenantId, name: n.name.trim(), sku: n.sku.trim() || null, sell_price: price, qty: 0, supplier_id: supplierId ?? null }
    const { data, error } = await sb.from(n.type === 'tire' ? 'tires' : 'products').insert(row).select('*').single()
    setCreating(false)
    if (error || !data) { alert('שגיאה ביצירת הפריט'); return }
    if (n.type === 'tire') setTires(t => [data as TireRow, ...t]); else setProds(p => [data as ProdRow, ...p])
    const label = n.type === 'tire' ? `${n.brand.trim()} ${n.width}/${n.profile}R${n.rim}`.trim() : n.name.trim()
    set(n.key, { ref_id: data.id, text: label })
    setNewItem(null)
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
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--success-soft)', borderRadius: '8px', marginBottom: '4px', fontSize: '13px' }}>
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
              const sg = focus === d.key && !d.ref_id ? suggestions(d) : { list: [], hidden: 0 }
              const sugg = sg.list
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
                      style={{ width: '100%', borderColor: d.ref_id ? 'var(--success)' : undefined }} />
                    {d.ref_id && <span style={{ fontSize: '11px', color: 'var(--success)' }}>✓ פריט קיים</span>}
                    {!d.ref_id && d.text.trim().length >= 2 && focus !== d.key && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>לא נבחר פריט מהמלאי — <button type="button" onClick={() => openNew(d)} style={{ border: 0, background: 'none', padding: 0, color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>הוסף כפריט חדש</button></span>
                    )}
                    {focus === d.key && !d.ref_id && d.text.trim().length >= 2 && (
                      <ul style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 20, margin: 0, padding: 0, listStyle: 'none', maxHeight: 300, overflowY: 'auto',
                        background: 'var(--bg-card, #fff)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                        {sugg.map(s => (
                          <li key={s.id}>
                            <button type="button" onMouseDown={e => { e.preventDefault(); set(d.key, { ref_id: s.id, text: s.label.replace(/ · מלאי \d+$/, '') }); setFocus(null) }}
                              style={{ width: '100%', textAlign: 'right', padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: s.other ? 'var(--text-muted)' : undefined }}>
                              {s.label}{s.other && <span style={{ fontSize: 11 }}> · ספק אחר</span>}
                            </button>
                          </li>
                        ))}
                        {sg.hidden > 0 && (
                          <li><button type="button" onMouseDown={e => { e.preventDefault(); setWide(w => new Set(w).add(d.key)) }}
                            style={{ width: '100%', textAlign: 'right', padding: '7px 10px', border: 'none', borderTop: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '12.5px', color: 'var(--primary)' }}>
                            הצג גם חברות של ספקים אחרים ({sg.hidden})
                          </button></li>
                        )}
                        <li><button type="button" onMouseDown={e => { e.preventDefault(); openNew(d) }}
                          style={{ width: '100%', textAlign: 'right', padding: '8px 10px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--primary)' }}>
                          + {d.item_type === 'tire' ? 'צמיג' : 'מוצר'} חדש שלא קיים במלאי…
                        </button></li>
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

      <Modal open={!!newItem} onClose={() => setNewItem(null)} title={newItem?.type === 'tire' ? 'צמיג חדש' : 'מוצר חדש'} maxWidth={460}
        footer={<>
          <Button variant="secondary" onClick={() => setNewItem(null)}>ביטול</Button>
          <Button onClick={createNew} loading={creating}
            disabled={!newItem || (newItem.type === 'tire' ? !(newItem.width && newItem.profile && newItem.rim) : !newItem.name.trim())}>הוסף ובחר</Button>
        </>}>
        {newItem && (newItem.type === 'tire' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <label style={{ gridColumn: '1 / -1' }} className="form-label">חברה
              <input className="form-input" list="arrival-brands" value={newItem.brand} onChange={e => setNewItem({ ...newItem, brand: e.target.value })} />
              <datalist id="arrival-brands">{[...new Set([...suppBrands, ...tires.map(t => t.brand).filter(Boolean) as string[]])].map(b => <option key={b} value={b} />)}</datalist>
            </label>
            {(['width', 'profile', 'rim'] as const).map(k => (
              <label key={k} className="form-label">{k === 'width' ? 'רוחב' : k === 'profile' ? 'פרופיל' : 'קוטר'}
                <input className="form-input" inputMode="numeric" value={newItem[k]} onChange={e => setNewItem({ ...newItem, [k]: e.target.value.replace(/\D/g, '') })} />
              </label>
            ))}
            <label className="form-label">אינדקס עומס<input className="form-input" value={newItem.load_idx} onChange={e => setNewItem({ ...newItem, load_idx: e.target.value })} /></label>
            <label className="form-label">אינדקס מהירות<input className="form-input" value={newItem.speed_idx} onChange={e => setNewItem({ ...newItem, speed_idx: e.target.value.toUpperCase() })} /></label>
            <label className="form-label">מחיר מכירה<input className="form-input" type="number" min="0" value={newItem.sell_price} onChange={e => setNewItem({ ...newItem, sell_price: e.target.value })} /></label>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">שם המוצר<input className="form-input" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} /></label>
            <label className="form-label">מק״ט / ברקוד<input className="form-input" value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} /></label>
            <label className="form-label">מחיר מכירה<input className="form-input" type="number" min="0" value={newItem.sell_price} onChange={e => setNewItem({ ...newItem, sell_price: e.target.value })} /></label>
          </div>
        ))}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>הכמות ומחיר הקנייה ייכנסו מהחשבונית כשתישמר.</p>
      </Modal>

      {total > 0 && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          סה״כ לפי הפריטים: <strong style={{ color: 'var(--text)' }}>₪{total.toLocaleString('he-IL', { maximumFractionDigits: 2 })}</strong> (להשוואה מול סכום החשבונית)
        </div>
      )}
    </Modal>
  )
}
