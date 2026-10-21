'use client'

import { useEffect, useState } from 'react'
import { Field, Sheet, Toggle, inputCls, inputStyle } from '@/components/yard-hub/ui'
import TireSizeInput, { parseTireSizeText, type TireSize } from '@/components/yard/TireSizeInput'
import { tireSizeSearchParams } from '@/lib/tires/size'

export interface NoStockCharge {
  type:  'tire' | 'product'
  name:  string
  price: number
  sku:   string | null
}

// Charge a tire / product that isn't in stock (or isn't in the system at all) so the
// register knows what to bill. The item is flagged "ללא מלאי" and listed for the office
// in "מעקב רחבה → נמכר ללא מלאי". Price is suggested from a matching item when one exists.
export default function NoStockChargeDialog({ kind, initialText = '', barcode = null, onConfirm, onClose }: {
  /** 'choose' = barcode not found: the worker says whether it's a tire or a product */
  kind: 'tire' | 'product' | 'choose'
  initialText?: string
  barcode?: string | null
  onConfirm: (c: NoStockCharge) => void
  onClose: () => void
}) {
  const [type, setType]   = useState<'tire' | 'product'>(kind === 'product' ? 'product' : 'tire')
  const [size, setSize]   = useState<TireSize>(() => parseTireSizeText(kind === 'tire' ? initialText : ''))
  const [brand, setBrand] = useState('')
  const [name, setName]   = useState(kind === 'product' ? initialText : '')
  const [price, setPrice] = useState('')
  const [hint, setHint]   = useState<string | null>(null)
  const [priceTouched, setPriceTouched] = useState(false)

  const fullSize = size.width.length === 3 && size.profile.length === 2 && size.rim.length === 2
  const sizeText = fullSize ? `${size.width}/${size.profile}R${size.rim}` : ''

  // Suggest a price from an item with the same size / name (even if out of stock)
  useEffect(() => {
    const q = type === 'tire'
      ? (fullSize ? tireSizeSearchParams(`${size.width}/${size.profile}/${size.rim}`) : '')
      : (name.trim().length >= 2 ? `q=${encodeURIComponent(name.trim())}` : '')
    if (!q) return
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/yard/search?${q}&type=${type}&include_empty=1`)
        .then(r => r.ok ? r.json() : [])
        .then((rows: { name: string; price: number }[]) => {
          if (cancelled) return
          const withPrice = rows.find(r => r.price > 0)
          setHint(withPrice ? `${withPrice.name} — ₪${withPrice.price}` : null)
          if (withPrice && !priceTouched) setPrice(String(withPrice.price))
        }).catch(() => {})
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [type, fullSize, size.width, size.profile, size.rim, name, priceTouched])

  const finalName = type === 'tire'
    ? [brand.trim(), sizeText].filter(Boolean).join(' ')
    : name.trim()
  const ok = (type === 'tire' ? fullSize : name.trim().length > 0) && Number(price) > 0

  return (
    <Sheet title="➕ חיוב ללא מלאי" onClose={onClose}>
      {barcode && <p className="text-sm text-slate-500">ברקוד <span style={{ fontFamily: 'monospace' }}>{barcode}</span> לא נמצא במערכת</p>}
      {kind === 'choose' && (
        <Toggle value={type} onChange={setType} options={[
          { value: 'tire',    label: '🔘 צמיג', color: '#1d4ed8' },
          { value: 'product', label: '📦 מוצר', color: '#7c3aed' },
        ]} />
      )}
      {type === 'tire' ? (<>
        <Field label="מידה *">
          <div className="bg-slate-900 rounded-xl" style={{ padding: '8px 4px' }}>
            <TireSizeInput value={size} onChange={setSize} autoFocus />
          </div>
        </Field>
        <Field label="מותג / דגם (לא חובה)">
          <input value={brand} onChange={e => setBrand(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      </>) : (
        <Field label="שם הפריט *">
          <input value={name} autoFocus onChange={e => setName(e.target.value)} className={inputCls} style={inputStyle} />
        </Field>
      )}
      <Field label="מחיר ליחידה (₪) *">
        <input type="number" inputMode="decimal" value={price}
          onChange={e => { setPrice(e.target.value); setPriceTouched(true) }}
          className={inputCls} style={inputStyle} />
      </Field>
      {hint && <p className="text-xs text-slate-500" style={{ marginTop: -6 }}>מחיר מוצע לפי: {hint}</p>}
      <p className="text-xs text-orange-700 font-semibold">הפריט יסומן ״ללא מלאי״ ויופיע במשרד לסידור מול המלאי</p>
      <button disabled={!ok}
        onClick={() => onConfirm({ type, name: finalName, price: Number(price), sku: barcode })}
        className="bg-orange-600 text-white rounded-xl font-black disabled:opacity-40" style={{ padding: '14px', fontSize: '18px' }}>
        ✓ חייב {finalName ? `— ${finalName}` : ''}
      </button>
    </Sheet>
  )
}
