'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  tenant_id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  unit_qty: number
  qty: number
  buy_price: number | null
  sell_price: number | null
  margin: number
  min_qty: number
  supplier_id: string | null
  notes: string | null
  created_at: string
}

interface Movement {
  id: string
  product_id: string
  qty: number
  sold_date: string
  movement_type: 'sale' | 'order'
}

interface Supplier { id: string; name: string }

// ── Constants ──────────────────────────────────────────────────────────────────

const UNITS = ['יח׳', 'ליטר', 'ק״ג', 'מ״ל', 'זוג', 'קופסה']

const emptyForm = {
  name: '', sku: '', category: '', unit: 'יח׳', unit_qty: '1',
  buy_price: '', margin: '', sell_price: '', qty: '0', min_qty: '0',
  supplier_id: '', notes: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₪' + Math.round(n).toLocaleString('he-IL', { useGrouping: true })
}
function fmtPrice(n: number | null) {
  if (!n) return '—'
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function thisMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProductsClient() {
  const sb = useRef(createClient()).current
  const tenantId = useRef<string>('')
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [movements, setMovements] = useState<Movement[]>([])

  // Tabs
  const [tab, setTab] = useState<'products' | 'movements'>('products')

  // Filters
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStock, setFilterStock] = useState('')

  // Add / Edit modal
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  // Inline edit mode (products table)
  const [editMode, setEditMode] = useState(false)
  const [editMap, setEditMap] = useState<Record<string, Partial<Product>>>({})

  // Movement form
  const [mvProductId, setMvProductId] = useState('')
  const [mvProductSearch, setMvProductSearch] = useState('')
  const [mvDropOpen, setMvDropOpen] = useState(false)
  const [mvType, setMvType] = useState<'sale' | 'order'>('sale')
  const [mvQty, setMvQty] = useState('')
  const [mvDate, setMvDate] = useState(todayISO())
  const [mvSaving, setMvSaving] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [{ data: prods }, { data: sups }, { data: mvs }] = await Promise.all([
      sb.from('products').select('*').eq('tenant_id', tenantId.current).order('created_at', { ascending: false }),
      sb.from('suppliers').select('id, name').eq('tenant_id', tenantId.current).order('name'),
      sb.from('product_sales').select('*').eq('tenant_id', tenantId.current)
        .order('sold_date', { ascending: false }).limit(200),
    ])
    setProducts(prods || [])
    setSuppliers(sups || [])
    setMovements(mvs || [])
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

  // ── Stats ───────────────────────────────────────────────────────────────────

  const totalItems     = products.length
  const inventoryValue = products.reduce((s, p) => s + (p.sell_price || 0) * p.qty, 0)
  const lowStock       = products.filter(p => p.min_qty > 0 && p.qty <= p.min_qty && p.qty > 0).length
  const outOfStock     = products.filter(p => p.qty === 0).length
  const monthStart     = thisMonthStart()
  const monthSales     = movements.filter(m => m.movement_type === 'sale' && m.sold_date >= monthStart)
  const soldThisMonth  = monthSales.reduce((s, m) => s + Number(m.qty), 0)
  const revenueMonth   = monthSales.reduce((s, m) => {
    const p = products.find(x => x.id === m.product_id)
    return s + (p?.sell_price || 0) * Number(m.qty)
  }, 0)

  // ── Filtered products ───────────────────────────────────────────────────────

  const cats = [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()

  const filtered = products.filter(p => {
    if (filterCat && p.category !== filterCat) return false
    if (filterStock === 'out' && p.qty !== 0) return false
    if (filterStock === 'low' && !(p.min_qty > 0 && p.qty <= p.min_qty && p.qty > 0)) return false
    if (search) {
      const hay = [p.name, p.category, p.sku, p.notes, p.unit].join(' ').toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function setF(k: keyof typeof emptyForm, v: string) { setForm(p => ({ ...p, [k]: v })) }
  function setFMulti(u: Partial<typeof emptyForm>) { setForm(p => ({ ...p, ...u })) }

  function openAdd() { setEditId(null); setForm(emptyForm); setFormOpen(true) }

  function openDuplicate(p: Product) {
    setEditId(null)
    setForm({
      name: p.name + ' (עותק)',
      sku: p.sku || '', category: p.category || '',
      unit: p.unit || 'יח׳', unit_qty: String(p.unit_qty ?? 1),
      buy_price: p.buy_price != null ? String(p.buy_price) : '',
      margin: p.margin ? String(p.margin) : '',
      sell_price: p.sell_price != null ? String(p.sell_price) : '',
      qty: '0', min_qty: String(p.min_qty ?? 0),
      supplier_id: p.supplier_id || '', notes: p.notes || '',
    })
    setFormOpen(true)
  }

  function openEdit(p: Product) {
    setEditId(p.id)
    setForm({
      name: p.name, sku: p.sku || '', category: p.category || '',
      unit: p.unit || 'יח׳', unit_qty: String(p.unit_qty ?? 1),
      buy_price: p.buy_price != null ? String(p.buy_price) : '',
      margin: p.margin ? String(p.margin) : '',
      sell_price: p.sell_price != null ? String(p.sell_price) : '',
      qty: String(p.qty ?? 0), min_qty: String(p.min_qty ?? 0),
      supplier_id: p.supplier_id || '', notes: p.notes || '',
    })
    setFormOpen(true)
  }

  // ── Save product (add/edit modal) ───────────────────────────────────────────

  async function saveForm() {
    if (!form.name.trim()) return showToast('יש להזין שם מוצר', 'error')
    const payload = {
      name: form.name.trim(), sku: form.sku.trim() || null,
      category: form.category.trim() || null, unit: form.unit,
      unit_qty: parseFloat(form.unit_qty) || 1,
      buy_price: form.buy_price !== '' ? parseFloat(form.buy_price) : null,
      margin: form.margin !== '' ? parseFloat(form.margin) : 0,
      sell_price: form.sell_price !== '' ? parseFloat(form.sell_price) : null,
      qty: parseInt(form.qty) || 0, min_qty: parseInt(form.min_qty) || 0,
      supplier_id: form.supplier_id || null, notes: form.notes.trim() || null,
    }
    if (editId) {
      const { error } = await sb.from('products').update(payload).eq('id', editId)
      if (error) return showToast('שגיאה בעדכון', 'error')
      showToast('המוצר עודכן ✓', 'success')
    } else {
      const { error } = await sb.from('products').insert({ tenant_id: tenantId.current, ...payload })
      if (error) return showToast('שגיאה בשמירה', 'error')
      showToast('המוצר נשמר ✓', 'success')
    }
    setFormOpen(false); setEditId(null); await load()
  }

  // ── Inline edit mode ────────────────────────────────────────────────────────

  function enterEditMode() {
    const map: Record<string, Partial<Product>> = {}
    products.forEach(p => { map[p.id] = { ...p } })
    setEditMap(map)
    setEditMode(true)
  }

  function setCell(id: string, field: keyof Product, value: string | number) {
    setEditMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveInlineEdit() {
    const updates = products.filter(p => {
      const e = editMap[p.id]
      if (!e) return false
      return e.name !== p.name || e.sell_price !== p.sell_price ||
        e.buy_price !== p.buy_price || e.category !== p.category || e.sku !== p.sku ||
        e.supplier_id !== p.supplier_id || e.notes !== p.notes || e.unit !== p.unit
    })
    if (updates.length === 0) { setEditMode(false); return }

    await Promise.all(updates.map(p => {
      const e = editMap[p.id]
      return sb.from('products').update({
        name: e.name, sku: e.sku || null, category: e.category || null,
        unit: e.unit,
        buy_price: e.buy_price || null, sell_price: e.sell_price || null,
        supplier_id: e.supplier_id || null, notes: e.notes || null,
      }).eq('id', p.id)
    }))

    showToast(`עודכנו ${updates.length} מוצרים ✓`, 'success')
    setEditMode(false)
    await load()
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteProduct(p: Product) {
    const ok = await confirm({ msg: `למחוק את "${p.name}"?` })
    if (!ok) return
    await sb.from('products').delete().eq('id', p.id)
    showToast('נמחק ✓', 'success')
    await load()
  }

  // ── Stock movement ──────────────────────────────────────────────────────────

  async function saveMovement() {
    if (!mvProductId) return showToast('יש לבחור מוצר', 'error')
    const qty = parseFloat(mvQty)
    if (!qty || qty <= 0) return showToast('יש להזין כמות', 'error')

    setMvSaving(true)
    const prod = products.find(p => p.id === mvProductId)
    if (!prod) return

    const newQty = mvType === 'order'
      ? prod.qty + qty
      : Math.max(0, prod.qty - qty)

    const [{ error: mvErr }, { error: qtyErr }] = await Promise.all([
      sb.from('product_sales').insert({
        tenant_id: tenantId.current,
        product_id: mvProductId,
        qty,
        sold_date: mvDate,
        movement_type: mvType,
      }),
      sb.from('products').update({ qty: newQty }).eq('id', mvProductId),
    ])

    if (mvErr || qtyErr) { showToast('שגיאה בשמירה', 'error') }
    else {
      showToast(mvType === 'sale' ? `נרשמה מכירה של ${qty} יח׳ ✓` : `נרשמה הזמנה של ${qty} יח׳ ✓`, 'success')
      setMvQty('')
      setMvProductId('')
      setMvProductSearch('')
    }
    setMvSaving(false)
    await load()
  }

  async function deleteMovement(mv: Movement) {
    const prod = products.find(p => p.id === mv.product_id)
    if (!prod) return
    // Reverse the effect
    const revertedQty = mv.movement_type === 'order'
      ? Math.max(0, prod.qty - mv.qty)
      : prod.qty + mv.qty

    await Promise.all([
      sb.from('product_sales').delete().eq('id', mv.id),
      sb.from('products').update({ qty: revertedQty }).eq('id', mv.product_id),
    ])
    showToast('נמחק ✓', 'success')
    await load()
  }

  // ── Excel ────────────────────────────────────────────────────────────────────

  function exportExcel() {
    if (products.length === 0) return showToast('אין נתונים לייצוא', 'error')
    const headers = ['מק"ט', 'שם מוצר', 'קטגוריה', 'יחידה', 'מחיר קנייה', 'מחיר מכירה', '% רווח', 'כמות', 'מינימום', 'ספק', 'הערות']
    const rows = products.map(p => [
      p.sku || '', p.name, p.category || '', p.unit,
      p.buy_price ?? '', p.sell_price ?? '', p.margin || '',
      p.qty, p.min_qty,
      suppliers.find(s => s.id === p.supplier_id)?.name || '',
      p.notes || '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'מוצרים')
    XLSX.writeFile(wb, 'מלאי-מוצרים.xlsx')
    showToast('הקובץ יוצא ✓', 'success')
  }

  function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const wb   = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]
      if (rows.length < 2) return showToast('הקובץ ריק', 'error')

      const inserts = rows.slice(1)
        .filter(r => r[1])
        .map(r => ({
          tenant_id:   tenantId.current,
          sku:         r[0] ? String(r[0]) : null,
          name:        String(r[1]),
          category:    r[2] ? String(r[2]) : null,
          unit:        r[3] ? String(r[3]) : 'יח׳',
          buy_price:   parseFloat(String(r[4])) || null,
          sell_price:  parseFloat(String(r[5])) || null,
          margin:      parseFloat(String(r[6])) || 0,
          qty:         parseInt(String(r[7])) || 0,
          min_qty:     parseInt(String(r[8])) || 0,
          notes:       r[10] ? String(r[10]) : null,
        }))

      if (inserts.length === 0) return showToast('לא נמצאו שורות תקינות', 'error')
      const { error } = await sb.from('products').insert(inserts)
      if (error) return showToast('שגיאה בייבוא', 'error')
      showToast(`יובאו ${inserts.length} מוצרים ✓`, 'success')
      await load()
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', background: 'var(--bg)',
    color: 'var(--text)', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '4px',
  }
  const cellInp: React.CSSProperties = {
    width: '100%', padding: '4px 6px', border: '1px solid var(--accent)',
    borderRadius: '6px', fontSize: '13px', background: '#eff6ff', color: 'var(--text)',
    boxSizing: 'border-box',
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>📦 מוצרים</h1>
        <Button onClick={openAdd}>➕ מוצר חדש</Button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard label='סה"כ פריטים'     value={totalItems} />
        <StatCard label='שווי מלאי'        value={fmt(inventoryValue)} color='blue' />
        <StatCard label='מלאי נמוך'        value={lowStock}            color='orange' />
        <StatCard label='פריטים שאזלו'     value={outOfStock}          color='red' />
        <StatCard label="יח' נמכרו החודש" value={soldThisMonth} />
        <StatCard label='הכנסות החודש'     value={fmt(revenueMonth)}   color='blue' />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
        {([['products', '📋 מוצרים'], ['movements', '📊 תנועות מלאי']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', borderRadius: '8px 8px 0 0',
            cursor: 'pointer', fontWeight: tab === t ? 700 : 400, fontSize: '14px',
            background: tab === t ? 'var(--bg-card)' : 'transparent',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px',
          }}>{label}</button>
        ))}
      </div>

      {/* ══════════ TAB: PRODUCTS ══════════ */}
      {tab === 'products' && (
        <>
          {/* Filters + edit mode toggle */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
            <input style={{ ...inp, maxWidth: '260px' }} placeholder="🔍  חיפוש..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select style={{ ...inp, width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value=''>כל הקטגוריות</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...inp, width: 'auto' }} value={filterStock} onChange={e => setFilterStock(e.target.value)}>
              <option value=''>כל המלאי</option>
              <option value='low'>מלאי נמוך</option>
              <option value='out'>אזל</option>
            </select>
            <div style={{ marginRight: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Button variant="outline" onClick={exportExcel} style={{ fontSize: '13px' }}>📊 ייצא Excel</Button>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                fontSize: '13px', cursor: 'pointer', background: 'var(--bg-card)',
                color: 'var(--text)', fontWeight: 500,
              }}>
                📥 ייבא Excel
                <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
              </label>
              {editMode ? (
                <>
                  <Button onClick={saveInlineEdit}>💾 שמור הכל</Button>
                  <Button variant="secondary" onClick={() => setEditMode(false)}>ביטול</Button>
                </>
              ) : (
                <Button variant="outline" onClick={enterEditMode}>✏️ עריכה</Button>
              )}
            </div>
          </div>

          {/* Products table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['מק"ט', 'שם מוצר', 'קטגוריה', 'יחידה', 'מחיר קנייה', 'מחיר מכירה', '% רווח', 'כמות', 'ספק', 'הערות', ...(editMode ? [''] : [])].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '8px' }}>📦</div>
                      <div>אין מוצרים</div>
                    </td></tr>
                  ) : filtered.map(p => {
                    const e = editMap[p.id] ?? p
                    const isLow = p.min_qty > 0 && p.qty <= p.min_qty && p.qty > 0
                    const isOut = p.qty === 0
                    const qtyColor = isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--primary)'
                    const qtyBg   = isOut ? '#fef2f2' : isLow ? '#fffbeb' : '#f0fdf4'
                    const marginPct = p.margin ? p.margin + '%'
                      : (p.buy_price && p.sell_price ? Math.round((p.sell_price / p.buy_price - 1) * 100) + '%' : '—')
                    const suppName = suppliers.find(s => s.id === p.supplier_id)?.name || '—'
                    const unitLabel = Number(p.unit_qty) > 1 ? `${p.unit_qty} ${p.unit}` : p.unit

                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: editMode ? '#fafeff' : undefined }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: editMode ? '80px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.sku ?? '')} onChange={ev => setCell(p.id, 'sku', ev.target.value)} />
                            : p.sku || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, minWidth: editMode ? '150px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.name ?? '')} onChange={ev => setCell(p.id, 'name', ev.target.value)} />
                            : p.name}
                        </td>
                        <td style={{ padding: '8px 12px', minWidth: editMode ? '110px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.category ?? '')} onChange={ev => setCell(p.id, 'category', ev.target.value)} list="cat-list-inline" />
                            : <span style={{ color: 'var(--text-muted)' }}>{p.category || '—'}</span>}
                        </td>
                        <td style={{ padding: '8px 12px', minWidth: editMode ? '90px' : undefined }}>
                          {editMode
                            ? <select style={cellInp} value={String(e.unit ?? 'יח׳')} onChange={ev => setCell(p.id, 'unit', ev.target.value)}>
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            : unitLabel}
                        </td>
                        <td style={{ padding: '8px 12px', minWidth: editMode ? '90px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} type="number" value={String(e.buy_price ?? '')} onChange={ev => setCell(p.id, 'buy_price', parseFloat(ev.target.value) || 0)} />
                            : p.buy_price ? (
                              <><div>{fmtPrice(p.buy_price)}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(p.buy_price * 1.18).toFixed(2)} עם מע&quot;מ</div></>
                            ) : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)', minWidth: editMode ? '90px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} type="number" value={String(e.sell_price ?? '')} onChange={ev => setCell(p.id, 'sell_price', parseFloat(ev.target.value) || 0)} />
                            : fmtPrice(p.sell_price)}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{marginPct}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: qtyBg, color: qtyColor, borderRadius: '6px', padding: '3px 8px', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {isOut ? 'אזל' : `${p.qty} ${Number(p.unit_qty) > 1 ? 'יח׳' : p.unit}`}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', minWidth: editMode ? '130px' : undefined }}>
                          {editMode
                            ? <select style={cellInp} value={String(e.supplier_id ?? '')} onChange={ev => setCell(p.id, 'supplier_id', ev.target.value)}>
                                <option value=''>—</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            : suppName}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: editMode ? undefined : '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: editMode ? undefined : 'nowrap', minWidth: editMode ? '120px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.notes ?? '')} onChange={ev => setCell(p.id, 'notes', ev.target.value)} />
                            : p.notes || '—'}
                        </td>
                        {editMode && (
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button title="שכפל" onClick={() => openDuplicate(p)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px 4px' }}>📋</button>
                              <button title="מחק" onClick={() => deleteProduct(p)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px 4px' }}>🗑️</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <datalist id="cat-list-inline">{cats.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
        </>
      )}

      {/* ══════════ TAB: MOVEMENTS ══════════ */}
      {tab === 'movements' && (
        <>
          {/* Quick entry form */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 700 }}>רישום תנועה</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>

              {/* Type toggle */}
              <div style={{ minWidth: '160px' }}>
                <div style={{ ...lbl }}>סוג תנועה</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([['sale', '💰 מכירה'], ['order', '📦 הזמנה']] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setMvType(t)} style={{
                      flex: 1, padding: '8px', border: `2px solid ${mvType === t ? (t === 'sale' ? 'var(--primary)' : 'var(--accent)') : 'var(--border)'}`,
                      borderRadius: '8px', cursor: 'pointer', fontWeight: mvType === t ? 700 : 400,
                      fontSize: '13px', background: mvType === t ? (t === 'sale' ? '#f0fdf4' : '#eff6ff') : 'var(--bg)',
                      color: mvType === t ? (t === 'sale' ? 'var(--primary)' : 'var(--accent)') : 'var(--text-muted)',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Product */}
              <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '200px' }}>
                <label style={lbl}>מוצר {mvProductId && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}</label>
                <input
                  style={{ ...inp, borderColor: mvProductId ? 'var(--primary)' : undefined }}
                  placeholder="חפש לפי שם או מק״ט..."
                  value={mvProductSearch}
                  autoComplete="off"
                  onFocus={() => setMvDropOpen(true)}
                  onBlur={() => setTimeout(() => setMvDropOpen(false), 150)}
                  onChange={e => {
                    const val = e.target.value
                    setMvProductSearch(val)
                    setMvDropOpen(true)
                    setMvQty('')
                    // exact match → auto-select
                    const exact = products.find(p =>
                      p.name.toLowerCase() === val.toLowerCase() ||
                      (p.sku != null && p.sku.toLowerCase() === val.toLowerCase())
                    )
                    setMvProductId(exact?.id ?? '')
                  }}
                />
                {/* Top-3 dropdown */}
                {mvDropOpen && mvProductSearch.trim() !== '' && (() => {
                  const q = mvProductSearch.toLowerCase()
                  const matches = products
                    .filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
                    .slice(0, 3)
                  if (matches.length === 0) return null
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: '2px',
                    }}>
                      {matches.map(p => (
                        <div key={p.id}
                          onMouseDown={() => {
                            setMvProductSearch(p.name)
                            setMvProductId(p.id)
                            setMvDropOpen(false)
                            setMvQty('')
                          }}
                          style={{
                            padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <span>
                            {p.sku && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>[{p.sku}]</span>}
                            <strong>{p.name}</strong>
                          </span>
                          <span style={{ fontSize: '11px', color: p.qty === 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                            מלאי: {p.qty} {p.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {mvProductId && !mvDropOpen && (() => {
                  const prod = products.find(x => x.id === mvProductId)
                  return prod ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      מלאי נוכחי: <strong style={{ color: prod.qty === 0 ? 'var(--danger)' : 'var(--primary)' }}>{prod.qty} {prod.unit}</strong>
                    </div>
                  ) : null
                })()}
              </div>

              {/* Qty */}
              <div style={{ width: '90px' }}>
                <label style={lbl}>כמות</label>
                <input style={inp} type="number" min="1" step="1" placeholder="1"
                  value={mvQty} onChange={e => setMvQty(e.target.value)} />
              </div>

              {/* Date */}
              <div style={{ width: '150px' }}>
                <label style={lbl}>תאריך</label>
                <input style={inp} type="date" value={mvDate} onChange={e => setMvDate(e.target.value)} />
              </div>

              {/* Save */}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Button onClick={saveMovement} loading={mvSaving} style={{ width: '100%' }}>
                  💾 רשום
                </Button>
              </div>
            </div>
          </div>

          {/* Movements table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '14px' }}>
              היסטוריית תנועות ({movements.length})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['תאריך', 'מוצר', 'סוג', 'כמות', 'השפעה על מלאי', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      אין תנועות עדיין
                    </td></tr>
                  ) : movements.map(mv => {
                    const prod = products.find(p => p.id === mv.product_id)
                    const isSale = mv.movement_type === 'sale'
                    return (
                      <tr key={mv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                          {new Date(mv.sold_date).toLocaleDateString('he-IL')}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {prod?.name || '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            background: isSale ? '#f0fdf4' : '#eff6ff',
                            color: isSale ? 'var(--primary)' : 'var(--accent)',
                            borderRadius: '6px', padding: '3px 10px', fontWeight: 600, fontSize: '12px',
                          }}>
                            {isSale ? '💰 מכירה' : '📦 הזמנה'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{Number(mv.qty)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: isSale ? 'var(--danger)' : 'var(--primary)', fontWeight: 600 }}>
                            {isSale ? `−${mv.qty}` : `+${mv.qty}`}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button title="מחק תנועה" onClick={() => deleteMovement(mv)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', color: 'var(--danger)' }}>
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)}
        title={editId ? '✏️ עריכת מוצר' : '➕ הוספת מוצר'} maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
          <Button onClick={saveForm}>💾 {editId ? 'שמור שינויים' : 'שמור מוצר'}</Button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', direction: 'rtl' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>שם מוצר <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input style={inp} value={form.name} onChange={e => setF('name', e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>קטגוריה</label>
            <input style={inp} value={form.category} onChange={e => setF('category', e.target.value)} list="cat-list" />
            <datalist id="cat-list">{cats.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>יחידה</label>
            <select style={inp} value={form.unit} onChange={e => setF('unit', e.target.value)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>כמות ליחידה</label>
            <input style={inp} type="number" value={form.unit_qty} onChange={e => setF('unit_qty', e.target.value)} min="0.01" step="0.01" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>מחיר קנייה (₪ לפני מע&quot;מ)</label>
            <input style={inp} type="number" value={form.buy_price} min="0" step="0.01" placeholder="0.00"
              onChange={e => {
                const updates: Partial<typeof emptyForm> = { buy_price: e.target.value }
                if (form.margin && parseFloat(e.target.value) > 0)
                  updates.sell_price = (parseFloat(e.target.value) * (1 + parseFloat(form.margin) / 100)).toFixed(2)
                setFMulti(updates)
              }} />
            {form.buy_price && !isNaN(parseFloat(form.buy_price)) && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                כולל מע&quot;מ: ₪{(parseFloat(form.buy_price) * 1.18).toFixed(2)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>% רווח</label>
            <input style={inp} type="number" value={form.margin} min="0" step="1" placeholder="20"
              onChange={e => {
                const updates: Partial<typeof emptyForm> = { margin: e.target.value }
                if (form.buy_price && parseFloat(form.buy_price) > 0)
                  updates.sell_price = (parseFloat(form.buy_price) * (1 + parseFloat(e.target.value) / 100)).toFixed(2)
                setFMulti(updates)
              }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>מחיר מכירה (₪)</label>
            <input style={inp} type="number" value={form.sell_price} onChange={e => setF('sell_price', e.target.value)} min="0" step="0.01" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>כמות במלאי</label>
            <input style={inp} type="number" value={form.qty} onChange={e => setF('qty', e.target.value)} min="0" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>כמות מינימום</label>
            <input style={inp} type="number" value={form.min_qty} onChange={e => setF('min_qty', e.target.value)} min="0" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>ספק</label>
            <select style={inp} value={form.supplier_id} onChange={e => setF('supplier_id', e.target.value)}>
              <option value=''>— ללא ספק —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={lbl}>ברקוד / מק״ט</label>
            <input style={inp} value={form.sku} onChange={e => setF('sku', e.target.value)} placeholder="מק״ט" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
            <label style={lbl}>הערות</label>
            <input style={inp} value={form.notes} onChange={e => setF('notes', e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: 'blue' | 'orange' | 'red' }) {
  const colors = { blue: 'var(--accent)', orange: 'var(--warning)', red: 'var(--danger)' }
  const bgs    = { blue: '#eff6ff',       orange: '#fffbeb',        red: '#fef2f2' }
  return (
    <div style={{ background: color ? bgs[color] : '#f0fdf4', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 900, color: color ? colors[color] : 'var(--primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}
