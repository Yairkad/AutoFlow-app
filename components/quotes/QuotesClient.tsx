'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { fetchVehicleByPlate } from '@/lib/utils/plateApi'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SupplierOffer {
  id: string
  supplier: string
  type: string
  price: number | null
  sell_price: number | null
  notes: string
  selected: boolean
}

interface Quote {
  id: string
  tenant_id: string
  type: 'tires' | 'parts'
  quote_date: string | null
  client_name: string | null
  phone: string | null
  plate: string | null
  // Tires
  brand: string | null
  width: number | null
  profile: number | null
  rim: number | null
  qty: number | null
  // Parts
  part_name: string | null
  sku: string | null
  car_model: string | null
  // Pricing
  supplier_offers: SupplierOffer[]
  cost_price: number | null
  sell_price: number | null
  profit: number | null
  supplier: string | null
  status: 'open' | 'quoted' | 'closed' | 'canceled'
  notes: string | null
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WIDTHS    = [145,155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315]
const PROFILES  = [25,30,35,40,45,50,55,60,65,70,75,80]
const RIMS      = [13,14,15,16,17,18,19,20,21,22]
const OFFER_TYPES = ['חדש', 'יד2', 'שיקום', 'אחר']

const STATUS_LABEL: Record<string, string> = {
  open: 'בטיפול', quoted: 'הוצעה', closed: 'נסגרה', canceled: 'בוטלה',
}
const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  open:     { color: '#92400e', bg: '#fef3c7' },
  quoted:   { color: '#1e40af', bg: '#dbeafe' },
  closed:   { color: '#065f46', bg: '#d1fae5' },
  canceled: { color: '#991b1b', bg: '#fee2e2' },
}

const emptyTireForm = {
  quote_date: '', client_name: '', phone: '', plate: '',
  brand: '', width: '', profile: '', rim: '', qty: '1',
  sell_price: '', status: 'open', notes: '',
}
const emptyPartForm = {
  quote_date: '', client_name: '', phone: '',
  plate: '', car_model: '', part_name: '',
  sell_price: '', status: 'open', notes: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10) }

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function tireSize(q: Pick<Quote, 'width' | 'profile' | 'rim'>) {
  if (!q.width) return '—'
  return `${q.width}/${q.profile}R${q.rim}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function whatsappPhone(phone: string | null) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0'))   return '972' + digits.slice(1)
  return '972' + digits
}

function newOffer(): SupplierOffer {
  return { id: crypto.randomUUID(), supplier: '', type: 'חדש', price: null, sell_price: null, notes: '', selected: false }
}

// ── Offer pure helpers (module-level so OffersSection doesn't remount) ─────────

function selectedOffer(offers: SupplierOffer[]) {
  return offers.find(o => o.selected) ?? null
}

function selectOffer(
  offers: SupplierOffer[], id: string,
  setOffers: React.Dispatch<React.SetStateAction<SupplierOffer[]>>
) {
  setOffers(offers.map(o => ({ ...o, selected: o.id === id })))
}

function updateOfferField(
  offers: SupplierOffer[], id: string,
  field: keyof SupplierOffer, rawVal: string,
  setOffers: React.Dispatch<React.SetStateAction<SupplierOffer[]>>,
  numTransform?: (v: string) => number | null
) {
  const isNumField = field === 'price' || field === 'sell_price'
  setOffers(offers.map(o =>
    o.id !== id ? o : {
      ...o,
      [field]: isNumField
        ? (numTransform ? numTransform(rawVal) : (parseFloat(rawVal) || null))
        : rawVal,
    }
  ))
}

function removeOffer(
  offers: SupplierOffer[], id: string,
  setOffers: React.Dispatch<React.SetStateAction<SupplierOffer[]>>
) {
  setOffers(offers.filter(o => o.id !== id))
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inpStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, background: 'white', fontFamily: 'inherit', width: '100%',
}
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12,
}

// ── OffersSection (module-level → stable identity → no focus loss) ────────────

const VAT_RATE = 1.18

function OffersSection({
  offers, setOffers, onSellPriceChange,
}: {
  offers: SupplierOffer[]
  setOffers: React.Dispatch<React.SetStateAction<SupplierOffer[]>>
  onSellPriceChange?: (v: string) => void
}) {
  const [vatInclusive, setVatInclusive] = useState(false)

  function toDisplay(p: number | null): string {
    if (p == null) return ''
    return vatInclusive ? (p * VAT_RATE).toFixed(2) : p.toString()
  }
  function fromInput(v: string): number | null {
    const n = parseFloat(v)
    if (!n) return null
    return vatInclusive ? +(n / VAT_RATE).toFixed(4) : n
  }

  function handleSelect(id: string) {
    const updated = offers.map(o => ({ ...o, selected: o.id === id }))
    setOffers(updated)
    const sel = updated.find(o => o.id === id)
    if (sel?.sell_price != null && onSellPriceChange) {
      onSellPriceChange(toDisplay(sel.sell_price))
    }
  }

  const sel = selectedOffer(offers)
  const COLS = '2fr 80px 95px 95px 1.2fr 36px 36px'

  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
          הצעות ספקים
        </span>
        <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>
          (לחץ ✓ לבחירת הצעה מועדפת)
        </span>
        {/* VAT toggle */}
        <button
          type="button"
          onClick={() => setVatInclusive(v => !v)}
          style={{
            marginRight: 'auto',
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            border: '1.5px solid',
            borderColor: vatInclusive ? '#059669' : 'var(--border)',
            background: vatInclusive ? '#d1fae5' : 'white',
            color: vatInclusive ? '#065f46' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {vatInclusive ? '✓ כולל מע"מ (17%)' : 'לפני מע"מ'}
        </button>
      </div>

      {offers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 6, padding: '0 2px', marginBottom: 4 }}>
          {['שם ספק', 'סוג', 'ספק (₪)', 'ללקוח (₪)', 'הערה', '', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</span>
          ))}
        </div>
      )}

      {offers.map(o => (
        <div key={o.id} style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 6, alignItems: 'center',
          background: o.selected ? '#f0fdf6' : 'var(--bg)',
          border: `2px solid ${o.selected ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 8, padding: '6px 8px', marginBottom: 4,
        }}>
          <input
            placeholder="שם ספק"
            value={o.supplier}
            onChange={e => updateOfferField(offers, o.id, 'supplier', e.target.value, setOffers)}
            style={inpStyle}
          />
          {!OFFER_TYPES.includes(o.type) || o.type === 'אחר' ? (
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={o.type === 'אחר'}
              placeholder="סוג מותאם..."
              value={o.type === 'אחר' ? '' : o.type}
              onChange={e => updateOfferField(offers, o.id, 'type', e.target.value || 'אחר', setOffers)}
              onKeyDown={e => e.key === 'Escape' && updateOfferField(offers, o.id, 'type', 'חדש', setOffers)}
              style={{ ...inpStyle, borderColor: '#6366f1', outline: '2px solid #e0e7ff' }}
            />
          ) : (
            <select
              value={o.type}
              onChange={e => updateOfferField(offers, o.id, 'type', e.target.value, setOffers)}
              style={inpStyle}
            >
              {OFFER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          )}
          {/* Supplier price */}
          <input
            type="number" placeholder="0.00"
            value={toDisplay(o.price)}
            onChange={e => updateOfferField(offers, o.id, 'price', e.target.value, setOffers, fromInput)}
            style={{ ...inpStyle, background: '#fff8e1' }}
          />
          {/* Customer price */}
          <input
            type="number" placeholder="0.00"
            value={toDisplay(o.sell_price)}
            onChange={e => {
              updateOfferField(offers, o.id, 'sell_price', e.target.value, setOffers, fromInput)
              if (o.selected && onSellPriceChange) onSellPriceChange(e.target.value)
            }}
            style={{ ...inpStyle, background: '#f0fdf4' }}
          />
          <input
            placeholder="הערה"
            value={o.notes}
            onChange={e => updateOfferField(offers, o.id, 'notes', e.target.value, setOffers)}
            style={inpStyle}
          />
          <button
            title="בחר הצעה זו"
            onClick={() => handleSelect(o.id)}
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: o.selected ? 'var(--primary)' : '#e2e8f0',
              color: o.selected ? 'white' : 'var(--text-muted)', fontWeight: 700, fontSize: 15,
            }}
          >✓</button>
          <button
            title="הסר שורה"
            onClick={() => removeOffer(offers, o.id, setOffers)}
            style={{
              width: 34, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: '#fee2e2', color: '#dc2626', fontWeight: 700,
            }}
          >✕</button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setOffers(prev => [...prev, newOffer()])}
        style={{
          marginTop: 4, padding: '5px 14px', fontSize: 13,
          border: '1px dashed var(--border)', borderRadius: 6,
          background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
        }}
      >
        ➕ הוסף הצעת ספק
      </button>

      {sel && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
          ✓ נבחר: {sel.supplier} — ספק: {fmt(sel.price)}{sel.sell_price != null ? ` · ללקוח: ${fmt(sel.sell_price)}` : ''}
        </div>
      )}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function QuotesClient() {
  const sb       = useRef(createClient()).current
  const tenantId = useRef<string>('')
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [tab, setTab]       = useState<'tires' | 'parts'>('tires')

  // Filters
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Modal (add / edit)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [modalTab,  setModalTab]  = useState<'tires' | 'parts'>('tires')

  // Forms
  const [tireForm,   setTireForm]   = useState({ ...emptyTireForm })
  const [partForm,   setPartForm]   = useState({ ...emptyPartForm })
  const [tireOffers, setTireOffers] = useState<SupplierOffer[]>([])
  const [partOffers, setPartOffers] = useState<SupplierOffer[]>([])
  const [saving,          setSaving]          = useState(false)
  const [editMode,        setEditMode]        = useState(false)
  const [loadingTirePlate, setLoadingTirePlate] = useState(false)
  const [loadingPartPlate, setLoadingPartPlate] = useState(false)
  const [tirePlateMeta,    setTirePlateMeta]    = useState('')

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data } = await sb
      .from('quotes')
      .select('*')
      .eq('tenant_id', tenantId.current)
      .in('type', ['tires', 'parts'])
      .order('created_at', { ascending: false })
    setQuotes(
      (data || []).map(q => ({
        ...q,
        supplier_offers: Array.isArray(q.supplier_offers) ? q.supplier_offers : [],
      }))
    )
  }, [sb])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single()
      if (profile) tenantId.current = profile.tenant_id
      await load()
    })()
  }, [sb, load])

  // ── Stats ──────────────────────────────────────────────────────────────────

  const openCount    = quotes.filter(q => q.status === 'open').length
  const quotedCount  = quotes.filter(q => q.status === 'quoted').length
  const closedCount  = quotes.filter(q => q.status === 'closed').length
  const totalProfit  = quotes
    .filter(q => q.status === 'closed' && q.profit != null)
    .reduce((s, q) => s + (q.profit || 0), 0)

  // ── Filtered ────────────────────────────────────────────────────────────────

  const filtered = quotes.filter(q => {
    if (q.type !== tab) return false
    if (filterStatus && q.status !== filterStatus) return false
    if (search) {
      const hay = [q.client_name, q.phone, q.plate, q.brand, q.part_name, q.sku, q.car_model, q.supplier]
        .join(' ').toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })

  // ── Plate API ──────────────────────────────────────────────────────────────

  async function searchTirePlate(plate: string) {
    if (plate.replace(/\D/g, '').length < 5) return
    setLoadingTirePlate(true)
    const data = await fetchVehicleByPlate(plate)
    setLoadingTirePlate(false)
    if (data) {
      const meta = [data.make, data.model, data.year].filter(Boolean).join(' ')
      setTirePlateMeta(meta)
    } else {
      setTirePlateMeta('לא נמצא')
    }
  }

  async function searchPartPlate(plate: string) {
    if (plate.replace(/\D/g, '').length < 5) return
    setLoadingPartPlate(true)
    const data = await fetchVehicleByPlate(plate)
    setLoadingPartPlate(false)
    if (data && (data.make || data.model)) {
      const meta = [data.make, data.model, data.year].filter(Boolean).join(' ')
      setPartForm(p => ({ ...p, car_model: meta }))
    }
  }

  // ── Modal open ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditId(null)
    setModalTab(tab)
    setTireForm({ ...emptyTireForm, quote_date: todayISO() })
    setPartForm({ ...emptyPartForm, quote_date: todayISO() })
    setTireOffers([])
    setPartOffers([])
    setTirePlateMeta('')
    setModalOpen(true)
  }

  function openEdit(q: Quote) {
    setEditId(q.id)
    setModalTab(q.type)
    if (q.type === 'tires') {
      setTireForm({
        quote_date:  q.quote_date  || todayISO(),
        client_name: q.client_name || '',
        phone:       q.phone       || '',
        plate:       q.plate       || '',
        brand:       q.brand       || '',
        width:       q.width?.toString()   || '',
        profile:     q.profile?.toString() || '',
        rim:         q.rim?.toString()     || '',
        qty:         q.qty?.toString()     || '1',
        sell_price:  q.sell_price?.toString() || '',
        status:      q.status,
        notes:       q.notes || '',
      })
      setTireOffers(q.supplier_offers)
    } else {
      setPartForm({
        quote_date:  q.quote_date  || todayISO(),
        client_name: q.client_name || '',
        phone:       q.phone       || '',
        plate:       q.plate       || '',
        car_model:   q.car_model   || '',
        part_name:   q.part_name   || '',
        sell_price:  q.sell_price?.toString() || '',
        status:      q.status,
        notes:       q.notes || '',
      })
      setPartOffers(q.supplier_offers)
    }
    setModalOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function save() {
    const isTire = modalTab === 'tires'
    const f      = isTire ? tireForm : partForm
    const offers = isTire ? tireOffers : partOffers

    if (!f.client_name.trim())                 { showToast('נדרש שם לקוח', 'error'); return }
    if (!f.phone.trim())                       { showToast('נדרש טלפון', 'error'); return }
    if (isTire && !tireForm.width)             { showToast('נדרשת מידת צמיג', 'error'); return }
    if (!isTire && !partForm.part_name.trim()) { showToast('נדרש שם חלק', 'error'); return }
    if (!isTire && !partForm.plate.trim())     { showToast('נדרש מספר רכב', 'error'); return }

    const sel    = selectedOffer(offers)
    const qty    = parseInt('qty' in f ? f.qty : '1') || 1
    const sell   = (sel?.sell_price ?? null) ?? (parseFloat(f.sell_price) || null)
    const cost   = sel?.price ?? null
    const profit = sell && cost ? (sell - cost) * qty : null

    const payload: Record<string, unknown> = {
      tenant_id:       tenantId.current,
      type:            modalTab,
      quote_date:      f.quote_date || todayISO(),
      client_name:     f.client_name.trim() || null,
      phone:           f.phone.trim()  || null,
      plate:           f.plate.trim()  || null,
      qty,
      supplier_offers: offers,
      cost_price:      cost,
      sell_price:      sell,
      profit,
      supplier:        sel?.supplier || null,
      status:          f.status,
      notes:           f.notes.trim() || null,
    }

    if (isTire) {
      payload.brand   = tireForm.brand.trim() || null
      payload.width   = parseInt(tireForm.width)   || null
      payload.profile = parseInt(tireForm.profile) || null
      payload.rim     = parseInt(tireForm.rim)     || null
    } else {
      payload.part_name = partForm.part_name.trim() || null
      payload.car_model = partForm.car_model.trim() || null
      payload.plate     = partForm.plate.trim()     || null
    }

    setSaving(true)
    const { error } = editId
      ? await sb.from('quotes').update(payload).eq('id', editId)
      : await sb.from('quotes').insert(payload)
    setSaving(false)

    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    showToast(editId ? 'עודכן ✓' : 'נשמר ✓', 'success')
    setModalOpen(false)
    await load()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function del(id: string) {
    const ok = await confirm({ msg: 'למחוק את ההצעה?', variant: 'danger' })
    if (!ok) return
    await sb.from('quotes').delete().eq('id', id)
    showToast('נמחק', 'success')
    await load()
  }

  // ── Status update ──────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: string) {
    await sb.from('quotes').update({ status }).eq('id', id)
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: status as Quote['status'] } : q))
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────────

  function sendWhatsApp(q: Quote) {
    const wp = whatsappPhone(q.phone)
    if (!wp) { showToast('אין מספר טלפון', 'error'); return }

    const name = q.client_name || 'לקוח יקר'
    let msg = ''

    if (q.type === 'tires') {
      const total = q.sell_price && q.qty ? q.sell_price * q.qty : null
      msg =
        `שלום ${name} 👋\n\n` +
        `הצעת מחיר לצמיגים:\n` +
        `מידה: ${tireSize(q)}${q.brand ? ' ' + q.brand : ''}\n` +
        `כמות: ${q.qty || 1}\n` +
        `מחיר ליחידה: ${fmt(q.sell_price)}\n` +
        `סה"כ: ${fmt(total)}` +
        (q.notes ? `\n\n${q.notes}` : '') +
        '\n\n_AutoFlow_'
    } else {
      msg =
        `שלום ${name} 👋\n\n` +
        `הצעת מחיר:\n` +
        `חלק: ${q.part_name || ''}\n` +
        (q.plate ? `מס׳ רכב: ${q.plate}\n` : '') +
        (q.car_model ? `רכב: ${q.car_model}\n` : '') +
        `מחיר: ${fmt(q.sell_price)}` +
        (q.notes ? `\n\n${q.notes}` : '') +
        '\n\n_AutoFlow_'
    }

    window.open(`https://wa.me/${wp}?text=${encodeURIComponent(msg)}`, '_blank')
    if (q.status === 'open') updateStatus(q.id, 'quoted')
  }

  // ── Sub-components ─────────────────────────────────────────────────────────

  function StatusBadge({ status }: { status: string }) {
    const c = STATUS_COLOR[status] || { color: '#555', bg: '#eee' }
    return (
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 12,
        fontWeight: 700, color: c.color, background: c.bg, whiteSpace: 'nowrap',
      }}>
        {STATUS_LABEL[status] || status}
      </span>
    )
  }

  // ── Profit preview ─────────────────────────────────────────────────────────

  function ProfitPreview({
    offers, sellStr, qtyStr,
  }: {
    offers: SupplierOffer[]; sellStr: string; qtyStr: string
  }) {
    const sel  = selectedOffer(offers)
    const sell = (sel?.sell_price ?? null) ?? (parseFloat(sellStr) || null)
    const cost = sel?.price ?? null
    const qty  = parseInt(qtyStr) || 1
    if (!sell || !cost) return null
    const profitUnit  = sell - cost
    const profitTotal = profitUnit * qty
    const pct = ((profitUnit / cost) * 100).toFixed(0)
    return (
      <div style={{
        gridColumn: '1 / -1',
        background: profitUnit >= 0 ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${profitUnit >= 0 ? '#bbf7d0' : '#fecaca'}`,
        borderRadius: 8, padding: '10px 14px', fontSize: 13,
        display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <span>עלות: <strong>{fmt(cost)}</strong></span>
        <span>מחיר ללקוח: <strong>{fmt(sell)}</strong></span>
        <span>רווח ליח׳: <strong style={{ color: profitUnit >= 0 ? 'var(--primary)' : '#dc2626' }}>
          {fmt(profitUnit)} ({pct}%)
        </strong></span>
        {qty > 1 && <span>סה״כ רווח: <strong>{fmt(profitTotal)}</strong></span>}
      </div>
    )
  }

  // ── Offers mini display in table ───────────────────────────────────────────

  function OffersPreview({ offers }: { offers: SupplierOffer[] }) {
    if (!offers.length) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {offers.map(o => (
          <div key={o.id} style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 5,
            background: o.selected ? '#f0fdf6' : 'transparent',
            border: o.selected ? '1px solid #86efac' : '1px solid transparent',
          }}>
            {o.selected && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}
            <span style={{ fontWeight: o.selected ? 700 : 400, color: 'var(--text)' }}>
              {o.supplier || '?'}
            </span>
            <span style={{ color: '#64748b' }}>ספק: {fmt(o.price)}</span>
            {o.sell_price != null && (
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>ללקוח: {fmt(o.sell_price)}</span>
            )}
            {o.type !== 'חדש' && <span style={{ color: 'var(--text-muted)' }}>({o.type})</span>}
          </div>
        ))}
      </div>
    )
  }

  // ── Modal form fields ──────────────────────────────────────────────────────

  const isTireModal = modalTab === 'tires'
  const f           = isTireModal ? tireForm : partForm
  const setF        = isTireModal
    ? (k: string, v: string) => setTireForm(p => ({ ...p, [k]: v }))
    : (k: string, v: string) => setPartForm(p => ({ ...p, [k]: v }))
  const offers    = isTireModal ? tireOffers : partOffers
  const setOffers = isTireModal ? setTireOffers : setPartOffers

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200 }}>

      {/* ── Page title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>💬 הצעות מחיר</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0' }}>
            ניהול בקשות לקוחות + הצעות ספקים
          </p>
        </div>
        <Button onClick={openAdd}>➕ הצעה חדשה</Button>
      </div>

      {/* ── Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'בטיפול',    value: openCount,   color: '#92400e', bg: '#fef3c7' },
          { label: 'הוצעה',     value: quotedCount,  color: '#1e40af', bg: '#dbeafe' },
          { label: 'נסגרו',     value: closedCount,  color: '#065f46', bg: '#d1fae5' },
          { label: 'רווח סגור', value: fmt(totalProfit), color: 'var(--primary)', bg: '#f0fdf4' },
        ].map(s => (
          <div key={s.label} style={{
            background: s.bg, borderRadius: 10, padding: '12px 16px',
            border: `1px solid ${s.color}22`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.color, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16, border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden', background: 'white', width: 'fit-content',
      }}>
        {(['tires', 'parts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 28px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: tab === t ? 'var(--primary)' : 'transparent',
              color: tab === t ? 'white' : 'var(--text-muted)',
              transition: 'all .15s',
            }}
          >
            {t === 'tires' ? '🔘 צמיגים' : '🔧 חלקים'}
          </button>
        ))}
      </div>

      {/* ── Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 חיפוש לפי שם / טלפון / רכב..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inpStyle, width: 280 }}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...inpStyle, width: 140 }}
        >
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* ── Table */}
      <div style={{
        background: 'white', borderRadius: 12, border: '1px solid var(--border)',
        overflow: 'hidden', boxShadow: 'var(--shadow)',
      }}>
        {/* Table toolbar */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg)',
        }}>
          <button
            onClick={() => setEditMode(p => !p)}
            style={{
              padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: editMode ? '#1e40af' : 'white', color: editMode ? 'white' : 'var(--text)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >{editMode ? '✓ סיום עריכה' : '✏️ עריכה'}</button>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
            <p>אין הצעות עדיין</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg)' }}>
                  {(tab === 'tires'
                    ? ['תאריך', 'לקוח', 'טלפון', 'רכב', 'מידה / מותג', 'כמות', 'הצעות ספקים', 'ללקוח', 'רווח', 'סטטוס', ...(editMode ? [''] : [])]
                    : ['תאריך', 'לקוח', 'טלפון', 'חלק', 'רכב / דגם', 'הצעות ספקים', 'ללקוח', 'רווח', 'סטטוס', ...(editMode ? [''] : [])]
                  ).map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 12px', textAlign: 'right', fontSize: 12,
                      fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((q, i) => (
                  <tr key={q.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'white' : '#fafafa',
                  }}>
                    <td style={tdStyle}>{formatDate(q.quote_date)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{q.client_name || '—'}</td>
                    <td style={tdStyle}>
                      {q.phone
                        ? <a href={`tel:${q.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{q.phone}</a>
                        : '—'}
                    </td>

                    {q.type === 'tires' ? (
                      <>
                        <td style={tdStyle}>{q.plate || '—'}</td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600 }}>{tireSize(q)}</span>
                          {q.brand && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> {q.brand}</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{q.qty ?? '—'}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...tdStyle, maxWidth: 180, fontWeight: 600 }}>{q.part_name || '—'}</td>
                        <td style={tdStyle}>
                          {q.plate && <div style={{ fontSize: 13 }}>{q.plate}</div>}
                          {q.car_model && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{q.car_model}</div>}
                          {!q.plate && !q.car_model && '—'}
                        </td>
                      </>
                    )}

                    <td style={{ ...tdStyle, minWidth: 160 }}>
                      <OffersPreview offers={q.supplier_offers} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                      {q.sell_price ? (
                        <>
                          {fmt(q.sell_price)}
                          {q.type === 'tires' && q.qty && q.qty > 1 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                              סה״כ {fmt(q.sell_price * q.qty)}
                            </div>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{
                      ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap',
                      color: q.profit != null ? (q.profit >= 0 ? 'var(--primary)' : '#dc2626') : 'var(--text-muted)',
                    }}>
                      {q.profit != null ? fmt(q.profit) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={q.status} />
                    </td>

                    {editMode && (
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {q.phone && (
                            <button title="WhatsApp" onClick={() => sendWhatsApp(q)} style={iconBtn('#25d366', 'white')}>📲</button>
                          )}
                          <select
                            value={q.status}
                            onChange={e => updateStatus(q.id, e.target.value)}
                            style={{ padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'white' }}
                          >
                            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button title="ערוך" onClick={() => openEdit(q)} style={iconBtn('var(--accent)', 'white')}>✏️</button>
                          <button title="מחק" onClick={() => del(q.id)} style={iconBtn('#dc2626', 'white')}>🗑️</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId
          ? `עריכת הצעה – ${isTireModal ? 'צמיגים' : 'חלקים'}`
          : 'הצעה חדשה'}
        maxWidth={720}
      >
        {/* Tab switch only when adding */}
        {!editId && (
          <div style={{
            display: 'flex', gap: 0, marginBottom: 20,
            border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          }}>
            {(['tires', 'parts'] as const).map(t => (
              <button
                key={t}
                onClick={() => setModalTab(t)}
                style={{
                  flex: 1, padding: '8px', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: modalTab === t ? 'var(--primary)' : 'transparent',
                  color: modalTab === t ? 'white' : 'var(--text-muted)',
                }}
              >
                {t === 'tires' ? '🔘 צמיגים' : '🔧 חלקים'}
              </button>
            ))}
          </div>
        )}

        <div style={gridStyle}>
          {/* ── Common fields */}
          <div style={fieldStyle}>
            <label style={labelStyle}>תאריך</label>
            <input type="date" value={f.quote_date} onChange={e => setF('quote_date', e.target.value)} style={inpStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>שם לקוח *</label>
            <input placeholder="שם" value={f.client_name} onChange={e => setF('client_name', e.target.value)} style={inpStyle} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>טלפון *</label>
            <input placeholder="050-0000000" value={f.phone} onChange={e => setF('phone', e.target.value)} style={inpStyle} />
          </div>

          {/* ── Tire-specific */}
          {isTireModal && (
            <>
              {/* מס׳ רכב + API */}
              <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>מס׳ רכב</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    placeholder="12-345-67"
                    value={tireForm.plate}
                    onChange={e => { setTireForm(p => ({ ...p, plate: e.target.value })); setTirePlateMeta('') }}
                    onKeyDown={e => e.key === 'Enter' && searchTirePlate(tireForm.plate)}
                    style={{ ...inpStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={loadingTirePlate || tireForm.plate.replace(/\D/g, '').length < 5}
                    onClick={() => searchTirePlate(tireForm.plate)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 600,
                      opacity: loadingTirePlate || tireForm.plate.replace(/\D/g, '').length < 5 ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >{loadingTirePlate ? '⏳' : '🔍 פרטי רכב'}</button>
                </div>
                {tirePlateMeta && (
                  <div style={{ fontSize: 12, color: tirePlateMeta === 'לא נמצא' ? '#dc2626' : 'var(--primary)', fontWeight: 600, marginTop: 3 }}>
                    {tirePlateMeta === 'לא נמצא' ? '⚠️ לא נמצא רכב' : `✓ ${tirePlateMeta}`}
                  </div>
                )}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>מותג</label>
                <input placeholder="Michelin, Bridgestone..." value={tireForm.brand} onChange={e => setTireForm(p => ({ ...p, brand: e.target.value }))} style={inpStyle} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>כמות</label>
                <input type="number" min={1} value={tireForm.qty} onChange={e => setTireForm(p => ({ ...p, qty: e.target.value }))} style={inpStyle} />
              </div>

              {/* מידות הצמיג – מקובצות */}
              <div style={{
                gridColumn: '1 / -1',
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: 10,
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>
                  🔘 מידת הצמיג
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>רוחב *</label>
                    <select value={tireForm.width} onChange={e => setTireForm(p => ({ ...p, width: e.target.value }))} style={inpStyle}>
                      <option value="">בחר</option>
                      {WIDTHS.map(w => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>פרופיל</label>
                    <select value={tireForm.profile} onChange={e => setTireForm(p => ({ ...p, profile: e.target.value }))} style={inpStyle}>
                      <option value="">בחר</option>
                      {PROFILES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>קוטר (R)</label>
                    <select value={tireForm.rim} onChange={e => setTireForm(p => ({ ...p, rim: e.target.value }))} style={inpStyle}>
                      <option value="">בחר</option>
                      {RIMS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Part-specific */}
          {!isTireModal && (
            <>
              <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>שם החלק *</label>
                <input placeholder="שם החלק המבוקש" value={partForm.part_name} onChange={e => setPartForm(p => ({ ...p, part_name: e.target.value }))} style={inpStyle} />
              </div>

              {/* רכב – מקובץ */}
              <div style={{
                gridColumn: '1 / -1',
                background: '#f0fdf4',
                border: '1.5px solid #bbf7d0',
                borderRadius: 10,
                padding: '12px 14px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 10 }}>
                  🚗 פרטי הרכב
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>מס׳ רכב *</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        placeholder="12-345-67"
                        value={partForm.plate}
                        onChange={e => setPartForm(p => ({ ...p, plate: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && searchPartPlate(partForm.plate)}
                        style={{ ...inpStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        disabled={loadingPartPlate || partForm.plate.replace(/\D/g, '').length < 5}
                        onClick={() => searchPartPlate(partForm.plate)}
                        style={{
                          padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: '#065f46', color: 'white', fontSize: 13, fontWeight: 600,
                          opacity: loadingPartPlate || partForm.plate.replace(/\D/g, '').length < 5 ? 0.5 : 1,
                        }}
                      >{loadingPartPlate ? '⏳' : '🔍'}</button>
                    </div>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>יצרן / דגם</label>
                    <input placeholder="ימולא אוטומטית" value={partForm.car_model} onChange={e => setPartForm(p => ({ ...p, car_model: e.target.value }))} style={inpStyle} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Supplier offers */}
          <OffersSection
            offers={offers}
            setOffers={setOffers}
            onSellPriceChange={v => setF('sell_price', v)}
          />

          {/* ── Pricing */}
          <div style={fieldStyle}>
            <label style={labelStyle}>הצעה ללקוח (₪{isTireModal ? ' ליח׳' : ''})</label>
            <input
              type="number" placeholder="0.00" min={0} step={0.01}
              value={f.sell_price}
              onChange={e => setF('sell_price', e.target.value)}
              style={inpStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>סטטוס</label>
            <select value={f.status} onChange={e => setF('status', e.target.value)} style={inpStyle}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>הערות</label>
            <input placeholder="הערה חופשית" value={f.notes} onChange={e => setF('notes', e.target.value)} style={inpStyle} />
          </div>

          {/* ── Profit preview */}
          <ProfitPreview offers={offers} sellStr={f.sell_price} qtyStr={'qty' in f ? f.qty : '1'} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>ביטול</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'שומר...' : '💾 שמור'}</Button>
        </div>
      </Modal>

    </div>
  )
}

// ── Misc styles ───────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13, verticalAlign: 'middle',
}

function iconBtn(bg: string, color: string): React.CSSProperties {
  return {
    width: 30, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer',
    background: bg, color, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
