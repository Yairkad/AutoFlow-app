'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Tire {
  id: string
  tenant_id: string
  brand: string | null
  width: number
  profile: number
  rim: number
  load_idx: string | null
  speed_idx: string | null
  cost_price: number | null
  margin: number
  sell_price: number | null
  qty: number
  location: string | null
  notes: string | null
  created_at: string
}

interface TireMovement {
  id: string
  tire_id: string
  qty: number
  sold_date: string
  movement_type: 'sale' | 'order'
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WIDTHS   = [145,155,165,175,185,195,205,215,225,235,245,255,265,275,285,295,305,315]
const PROFILES = [25,30,35,40,45,50,55,60,65,70,75,80]
const RIMS     = [13,14,15,16,17,18,19,20,21,22]

const emptyForm = {
  brand: '', width: '', profile: '', rim: '',
  load_idx: '', speed_idx: '',
  cost_price: '', margin: '', sell_price: '',
  qty: '0', location: '', notes: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tireSize(t: Pick<Tire, 'width' | 'profile' | 'rim'>) {
  return `${t.width}/${t.profile}R${t.rim}`
}
function fmtPrice(n: number | null | undefined) {
  if (!n) return '—'
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmt(n: number) {
  return '₪' + Math.round(n).toLocaleString('he-IL', { useGrouping: true })
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function thisMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TiresClient() {
  const sb = useRef(createClient()).current
  const tenantId = useRef<string>('')
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [viewOnly, setViewOnly]   = useState(false)
  const [tires, setTires]         = useState<Tire[]>([])
  const [movements, setMovements] = useState<TireMovement[]>([])

  const [tab, setTab] = useState<'tires' | 'movements'>('tires')

  // Filters
  const [search,      setSearch]      = useState('')
  const [filterWidth, setFilterWidth] = useState('')
  const [filterProf,  setFilterProf]  = useState('')
  const [filterRim,   setFilterRim]   = useState('')
  const [filterStock, setFilterStock] = useState('')

  // Add/Edit modal
  const [formOpen, setFormOpen] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(emptyForm)
  const [formErrs, setFormErrs] = useState({ width: false, profile: false, rim: false })

  // Inline edit
  const [editMode, setEditMode] = useState(false)
  const [editMap,  setEditMap]  = useState<Record<string, Partial<Tire>>>({})

  // Movement form
  const [mvTireId,     setMvTireId]     = useState('')
  const [mvTireSearch, setMvTireSearch] = useState('')
  const [mvDropOpen,   setMvDropOpen]   = useState(false)
  const [mvType,       setMvType]       = useState<'sale' | 'order'>('sale')
  const [mvQty,        setMvQty]        = useState('')
  const [mvDate,       setMvDate]       = useState(todayISO())
  const [mvSaving,     setMvSaving]     = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [{ data: ts }, { data: mvs }] = await Promise.all([
      sb.from('tires').select('*').eq('tenant_id', tenantId.current).order('created_at', { ascending: false }),
      sb.from('tire_sales').select('*').eq('tenant_id', tenantId.current)
        .order('sold_date', { ascending: false }).limit(300),
    ])
    setTires(ts || [])
    setMovements(mvs || [])
  }, [sb])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id, role, allowed_modules').eq('id', user.id).single()
      if (profile) {
        tenantId.current = profile.tenant_id
        const admin   = profile.role === 'admin'
        const hasFull = (profile.allowed_modules ?? []).includes('tires')
        const hasView = (profile.allowed_modules ?? []).includes('tires_view')
        setViewOnly(!admin && !hasFull && hasView)
      }
      await load()
    })()
  }, [sb, load])

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const totalTypes   = tires.length
  const totalUnits   = tires.reduce((s, t) => s + t.qty, 0)
  const inStock      = tires.filter(t => t.qty > 0).length
  const outOfStock   = tires.filter(t => t.qty === 0).length
  const monthStart   = thisMonthStart()
  const monthSales   = movements.filter(m => m.movement_type === 'sale' && m.sold_date >= monthStart)
  const soldThisMonth = monthSales.reduce((s, m) => s + Number(m.qty), 0)
  const revenueMonth = monthSales.reduce((s, m) => {
    const t = tires.find(x => x.id === m.tire_id)
    return s + (t?.sell_price || 0) * Number(m.qty)
  }, 0)

  // ── Filtered tires ────────────────────────────────────────────────────────────

  const filtered = tires
    .filter(t => {
      if (filterWidth && t.width   !== parseInt(filterWidth)) return false
      if (filterProf  && t.profile !== parseInt(filterProf))  return false
      if (filterRim   && t.rim     !== parseInt(filterRim))   return false
      if (filterStock === 'out'     && t.qty !== 0) return false
      if (filterStock === 'instock' && t.qty === 0) return false
      if (search) {
        const hay = [t.brand, tireSize(t), t.location, t.notes, t.load_idx, t.speed_idx]
          .join(' ').toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => {
      const sa = tireSize(a), sb2 = tireSize(b)
      if (sa !== sb2) return sa.localeCompare(sb2)
      return (a.brand || '').localeCompare(b.brand || '')
    })

  // ── Form helpers ──────────────────────────────────────────────────────────────

  function setF(k: keyof typeof emptyForm, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function calcSellPrice(costStr: string, marginStr: string) {
    const cost   = parseFloat(costStr)
    const margin = parseFloat(marginStr)
    if (cost > 0 && !isNaN(margin))
      setF('sell_price', (cost * (1 + margin / 100)).toFixed(2))
  }

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setFormErrs({ width: false, profile: false, rim: false })
    setFormOpen(true)
  }

  function openEdit(t: Tire) {
    setEditId(t.id)
    setForm({
      brand: t.brand || '', width: String(t.width), profile: String(t.profile), rim: String(t.rim),
      load_idx: t.load_idx || '', speed_idx: t.speed_idx || '',
      cost_price: t.cost_price != null ? String(t.cost_price) : '',
      margin: t.margin ? String(t.margin) : '',
      sell_price: t.sell_price != null ? String(t.sell_price) : '',
      qty: String(t.qty), location: t.location || '', notes: t.notes || '',
    })
    setFormErrs({ width: false, profile: false, rim: false })
    setFormOpen(true)
  }

  function openDuplicate(t: Tire) {
    setEditId(null)
    setForm({
      brand: t.brand || '', width: String(t.width), profile: String(t.profile), rim: String(t.rim),
      load_idx: t.load_idx || '', speed_idx: t.speed_idx || '',
      cost_price: t.cost_price != null ? String(t.cost_price) : '',
      margin: t.margin ? String(t.margin) : '',
      sell_price: t.sell_price != null ? String(t.sell_price) : '',
      qty: '0', location: t.location || '', notes: t.notes || '',
    })
    setFormErrs({ width: false, profile: false, rim: false })
    setFormOpen(true)
  }

  // ── Save (modal) ──────────────────────────────────────────────────────────────

  async function saveForm() {
    const errs = {
      width:   !form.width,
      profile: !form.profile,
      rim:     !form.rim,
    }
    setFormErrs(errs)
    if (Object.values(errs).some(Boolean)) return showToast('יש להזין מידת צמיג מלאה', 'error')

    const payload = {
      brand:      form.brand.trim() || null,
      width:      parseInt(form.width),
      profile:    parseInt(form.profile),
      rim:        parseInt(form.rim),
      load_idx:   form.load_idx.trim() || null,
      speed_idx:  form.speed_idx.trim() || null,
      cost_price: form.cost_price !== '' ? parseFloat(form.cost_price) : null,
      margin:     form.margin !== '' ? parseFloat(form.margin) : 0,
      sell_price: form.sell_price !== '' ? parseFloat(form.sell_price) : null,
      qty:        parseInt(form.qty) || 0,
      location:   form.location.trim() || null,
      notes:      form.notes.trim() || null,
    }

    if (editId) {
      const { error } = await sb.from('tires').update(payload).eq('id', editId)
      if (error) return showToast('שגיאה בעדכון', 'error')
      showToast('הצמיג עודכן ✓', 'success')
    } else {
      const { error } = await sb.from('tires').insert({ tenant_id: tenantId.current, ...payload })
      if (error) return showToast('שגיאה בשמירה', 'error')
      showToast('הצמיג נשמר ✓', 'success')
    }
    setFormOpen(false)
    setEditId(null)
    await load()
  }

  // ── Inline edit ───────────────────────────────────────────────────────────────

  function enterEditMode() {
    const map: Record<string, Partial<Tire>> = {}
    tires.forEach(t => { map[t.id] = { ...t } })
    setEditMap(map)
    setEditMode(true)
  }

  function setCell(id: string, field: keyof Tire, value: string | number | null) {
    setEditMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveInlineEdit() {
    const updates = tires.filter(t => {
      const e = editMap[t.id]
      if (!e) return false
      return e.brand !== t.brand || e.sell_price !== t.sell_price ||
        e.cost_price !== t.cost_price || e.margin !== t.margin ||
        e.load_idx !== t.load_idx || e.speed_idx !== t.speed_idx ||
        e.location !== t.location || e.notes !== t.notes ||
        e.width !== t.width || e.profile !== t.profile || e.rim !== t.rim
    })
    if (updates.length === 0) { setEditMode(false); return }

    await Promise.all(updates.map(t => {
      const e = editMap[t.id]
      return sb.from('tires').update({
        brand:      e.brand || null,
        width:      Number(e.width) || t.width,
        profile:    Number(e.profile) || t.profile,
        rim:        Number(e.rim) || t.rim,
        load_idx:   e.load_idx || null,
        speed_idx:  e.speed_idx || null,
        cost_price: e.cost_price || null,
        margin:     Number(e.margin) || 0,
        sell_price: e.sell_price || null,
        location:   e.location || null,
        notes:      e.notes || null,
      }).eq('id', t.id)
    }))

    showToast(`עודכנו ${updates.length} צמיגים ✓`, 'success')
    setEditMode(false)
    await load()
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function deleteTire(t: Tire) {
    const ok = await confirm({ msg: `למחוק ${t.brand ? t.brand + ' ' : ''}${tireSize(t)}?` })
    if (!ok) return
    await sb.from('tires').delete().eq('id', t.id)
    showToast('נמחק ✓', 'success')
    await load()
  }

  // ── Movements ─────────────────────────────────────────────────────────────────

  async function saveMovement() {
    if (!mvTireId) return showToast('יש לבחור צמיג', 'error')
    const qty = parseInt(mvQty)
    if (!qty || qty <= 0) return showToast('יש להזין כמות', 'error')

    setMvSaving(true)
    const tire = tires.find(t => t.id === mvTireId)
    if (!tire) { setMvSaving(false); return }

    const newQty = mvType === 'order'
      ? tire.qty + qty
      : Math.max(0, tire.qty - qty)

    const [{ error: mvErr }, { error: qtyErr }] = await Promise.all([
      sb.from('tire_sales').insert({
        tenant_id: tenantId.current,
        tire_id: mvTireId,
        qty,
        sold_date: mvDate,
        movement_type: mvType,
      }),
      sb.from('tires').update({ qty: newQty }).eq('id', mvTireId),
    ])

    if (mvErr || qtyErr) { showToast('שגיאה בשמירה', 'error') }
    else {
      showToast(mvType === 'sale' ? `נרשמה מכירה של ${qty} יח׳ ✓` : `נרשמה הזמנה של ${qty} יח׳ ✓`, 'success')
      setMvQty('')
      setMvTireId('')
      setMvTireSearch('')
    }
    setMvSaving(false)
    await load()
  }

  async function deleteMovement(mv: TireMovement) {
    const tire = tires.find(t => t.id === mv.tire_id)
    if (!tire) return
    const revertedQty = mv.movement_type === 'order'
      ? Math.max(0, tire.qty - mv.qty)
      : tire.qty + mv.qty
    await Promise.all([
      sb.from('tire_sales').delete().eq('id', mv.id),
      sb.from('tires').update({ qty: revertedQty }).eq('id', mv.tire_id),
    ])
    showToast('נמחק ✓', 'success')
    await load()
  }

  // ── Excel ─────────────────────────────────────────────────────────────────────

  function exportExcel() {
    if (tires.length === 0) return showToast('אין נתונים לייצוא', 'error')
    const headers = ['מותג','רוחב','פרופיל','קוטר','מידה','אינדקס עומס','אינדקס מהירות','מחיר קנייה','% רווח','מחיר מכירה','כמות','מיקום','הערות']
    const rows = tires.map(t => [
      t.brand || '', t.width, t.profile, t.rim, tireSize(t),
      t.load_idx || '', t.speed_idx || '',
      t.cost_price ?? '', t.margin || '', t.sell_price ?? '',
      t.qty, t.location || '', t.notes || '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'צמיגים')
    XLSX.writeFile(wb, 'מלאי-צמיגים.xlsx')
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
        .filter(r => r[1] && r[2] && r[3])
        .map(r => {
          const cost   = parseFloat(String(r[7])) || 0
          const margin = parseFloat(String(r[8])) || 0
          const sell   = parseFloat(String(r[9])) || (cost > 0 && margin > 0 ? cost * (1 + margin / 100) : 0)
          return {
            tenant_id:  tenantId.current,
            brand:      r[0] ? String(r[0]) : null,
            width:      parseInt(String(r[1])) || 0,
            profile:    parseInt(String(r[2])) || 0,
            rim:        parseInt(String(r[3])) || 0,
            load_idx:   r[5] ? String(r[5]) : null,
            speed_idx:  r[6] ? String(r[6]) : null,
            cost_price: cost || null,
            margin,
            sell_price: sell || null,
            qty:        parseInt(String(r[10])) || 0,
            location:   r[11] ? String(r[11]) : null,
            notes:      r[12] ? String(r[12]) : null,
          }
        })

      if (inserts.length === 0) return showToast('לא נמצאו שורות תקינות', 'error')
      const { error } = await sb.from('tires').insert(inserts)
      if (error) return showToast('שגיאה בייבוא', 'error')
      showToast(`יובאו ${inserts.length} צמיגים ✓`, 'success')
      await load()
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', background: 'var(--bg)',
    color: 'var(--text)', boxSizing: 'border-box',
  }
  const inpErr = (err?: boolean): React.CSSProperties => ({
    ...inp,
    borderColor: err ? 'var(--danger)' : undefined,
    background:  err ? '#fff5f5' : undefined,
  })
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '4px',
  }
  const cellInp: React.CSSProperties = {
    width: '100%', padding: '4px 6px', border: '1px solid var(--accent)',
    borderRadius: '6px', fontSize: '13px', background: '#eff6ff',
    color: 'var(--text)', boxSizing: 'border-box',
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>🔘 צמיגים</h1>
          {viewOnly && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>מצב צפיה בלבד</div>}
        </div>
        {!viewOnly && <Button onClick={openAdd}>➕ צמיג חדש</Button>}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard label='סוגי צמיג'         value={totalTypes} />
        <StatCard label='יחידות במלאי'       value={totalUnits}           color='blue' />
        <StatCard label='סוגים במלאי'        value={inStock}              color='green' />
        <StatCard label='סוגים שאזלו'        value={outOfStock}           color='red' />
        <StatCard label="יח' נמכרו החודש"   value={soldThisMonth} />
        <StatCard label='הכנסות החודש'       value={fmt(revenueMonth)}    color='blue' />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid var(--border)' }}>
        {([['tires', '🔘 מלאי'], ['movements', '📊 תנועות מלאי']] as const).map(([t, label]) => (
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

      {/* ══════════ TAB: TIRES ══════════ */}
      {tab === 'tires' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
            <input style={{ ...inp, maxWidth: '220px' }} placeholder="🔍  חיפוש מותג / מידה..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <input style={{ ...inp, width: '80px' }} type="number" placeholder="רוחב"
              value={filterWidth} onChange={e => setFilterWidth(e.target.value)} list="fw-list" />
            <datalist id="fw-list">{WIDTHS.map(w => <option key={w} value={w} />)}</datalist>
            <input style={{ ...inp, width: '80px' }} type="number" placeholder="פרופיל"
              value={filterProf} onChange={e => setFilterProf(e.target.value)} list="fp-list" />
            <datalist id="fp-list">{PROFILES.map(p => <option key={p} value={p} />)}</datalist>
            <input style={{ ...inp, width: '75px' }} type="number" placeholder="קוטר"
              value={filterRim} onChange={e => setFilterRim(e.target.value)} list="fr-list" />
            <datalist id="fr-list">{RIMS.map(r => <option key={r} value={r} />)}</datalist>
            <select style={{ ...inp, width: 'auto' }} value={filterStock} onChange={e => setFilterStock(e.target.value)}>
              <option value=''>כל המלאי</option>
              <option value='instock'>במלאי</option>
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
              {!viewOnly && (editMode ? (
                <>
                  <Button onClick={saveInlineEdit}>💾 שמור הכל</Button>
                  <Button variant="secondary" onClick={() => setEditMode(false)}>ביטול</Button>
                </>
              ) : (
                <Button variant="outline" onClick={enterEditMode}>✏️ עריכה</Button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['מותג', 'מידה', 'מדדים', 'מחיר קנייה', '% רווח', 'מחיר מכירה', 'כמות', 'מיקום', 'הערות', ...(editMode ? [''] : [])].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔘</div>
                      <div>אין צמיגים</div>
                    </td></tr>
                  ) : filtered.map(t => {
                    const e = editMap[t.id] ?? t
                    const isOut = t.qty === 0
                    const isLow = t.qty > 0 && t.qty <= 2
                    const qtyColor = isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--primary)'
                    const qtyBg   = isOut ? '#fef2f2' : isLow ? '#fffbeb' : '#f0fdf4'
                    const marginPct = t.margin
                      ? t.margin + '%'
                      : (t.cost_price && t.sell_price ? Math.round((t.sell_price / t.cost_price - 1) * 100) + '%' : '—')
                    const indices = [t.load_idx, t.speed_idx].filter(Boolean).join(' / ') || '—'

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', background: editMode ? '#fafeff' : undefined }}>

                        {/* מותג */}
                        <td style={{ padding: '8px 12px', fontWeight: 700, minWidth: editMode ? '110px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.brand ?? '')} onChange={ev => setCell(t.id, 'brand', ev.target.value)} list="brand-list-inline" />
                            : t.brand || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>

                        {/* מידה */}
                        <td style={{ padding: '8px 12px' }}>
                          {editMode ? (
                            <div style={{ display: 'flex', gap: '4px', minWidth: '180px' }}>
                              <input style={{ ...cellInp, width: '52px' }} type="number" value={String(e.width ?? '')} onChange={ev => setCell(t.id, 'width', parseInt(ev.target.value) || 0)} list="fw-list-inline" placeholder="רוחב" />
                              <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>/</span>
                              <input style={{ ...cellInp, width: '48px' }} type="number" value={String(e.profile ?? '')} onChange={ev => setCell(t.id, 'profile', parseInt(ev.target.value) || 0)} list="fp-list-inline" placeholder="פרופ'" />
                              <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>R</span>
                              <input style={{ ...cellInp, width: '44px' }} type="number" value={String(e.rim ?? '')} onChange={ev => setCell(t.id, 'rim', parseInt(ev.target.value) || 0)} list="fr-list-inline" placeholder="קוטר" />
                            </div>
                          ) : (
                            <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--accent)', letterSpacing: '0.5px' }}>
                              {tireSize(t)}
                            </span>
                          )}
                        </td>

                        {/* מדדים */}
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: editMode ? '130px' : undefined }}>
                          {editMode ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input style={{ ...cellInp, width: '54px' }} value={String(e.load_idx ?? '')} onChange={ev => setCell(t.id, 'load_idx', ev.target.value)} placeholder="עומס" />
                              <input style={{ ...cellInp, width: '44px' }} value={String(e.speed_idx ?? '')} onChange={ev => setCell(t.id, 'speed_idx', ev.target.value)} placeholder="מהיר'" />
                            </div>
                          ) : indices}
                        </td>

                        {/* מחיר קנייה */}
                        <td style={{ padding: '8px 12px', minWidth: editMode ? '90px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} type="number" value={String(e.cost_price ?? '')} onChange={ev => setCell(t.id, 'cost_price', parseFloat(ev.target.value) || 0)} />
                            : t.cost_price ? (
                              <>
                                <div>{fmtPrice(t.cost_price)}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(t.cost_price * 1.18).toFixed(2)} עם מע&quot;מ</div>
                              </>
                            ) : '—'}
                        </td>

                        {/* % רווח */}
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', minWidth: editMode ? '70px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} type="number" value={String(e.margin ?? '')} onChange={ev => setCell(t.id, 'margin', parseFloat(ev.target.value) || 0)} />
                            : marginPct}
                        </td>

                        {/* מחיר מכירה */}
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)', minWidth: editMode ? '90px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} type="number" value={String(e.sell_price ?? '')} onChange={ev => setCell(t.id, 'sell_price', parseFloat(ev.target.value) || 0)} />
                            : fmtPrice(t.sell_price)}
                        </td>

                        {/* כמות — read-only */}
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: qtyBg, color: qtyColor, borderRadius: '6px', padding: '3px 8px', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {isOut ? 'אזל' : t.qty}
                          </span>
                        </td>

                        {/* מיקום */}
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: editMode ? '100px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.location ?? '')} onChange={ev => setCell(t.id, 'location', ev.target.value)} />
                            : t.location || '—'}
                        </td>

                        {/* הערות */}
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: editMode ? undefined : '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: editMode ? undefined : 'nowrap', minWidth: editMode ? '120px' : undefined }}>
                          {editMode
                            ? <input style={cellInp} value={String(e.notes ?? '')} onChange={ev => setCell(t.id, 'notes', ev.target.value)} />
                            : t.notes || '—'}
                        </td>

                        {/* פעולות (עריכה בלבד) */}
                        {editMode && !viewOnly && (
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button title="שכפל" onClick={() => openDuplicate(t)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px 4px' }}>📋</button>
                              <button title="מחק" onClick={() => deleteTire(t)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px 4px' }}>🗑️</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Datalists for inline edit */}
              <datalist id="brand-list-inline">
                {[...new Set(tires.map(t => t.brand).filter(Boolean) as string[])].sort().map(b => <option key={b} value={b} />)}
              </datalist>
              <datalist id="fw-list-inline">{WIDTHS.map(w => <option key={w} value={w} />)}</datalist>
              <datalist id="fp-list-inline">{PROFILES.map(p => <option key={p} value={p} />)}</datalist>
              <datalist id="fr-list-inline">{RIMS.map(r => <option key={r} value={r} />)}</datalist>
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

              {/* Type */}
              <div style={{ minWidth: '160px' }}>
                <div style={lbl}>סוג תנועה</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([['sale', '💰 מכירה'], ['order', '📦 הזמנה']] as const).map(([tp, label]) => (
                    <button key={tp} onClick={() => setMvType(tp)} style={{
                      flex: 1, padding: '8px', border: `2px solid ${mvType === tp ? (tp === 'sale' ? 'var(--primary)' : 'var(--accent)') : 'var(--border)'}`,
                      borderRadius: '8px', cursor: 'pointer', fontWeight: mvType === tp ? 700 : 400, fontSize: '13px',
                      background: mvType === tp ? (tp === 'sale' ? '#f0fdf4' : '#eff6ff') : 'var(--bg)',
                      color: mvType === tp ? (tp === 'sale' ? 'var(--primary)' : 'var(--accent)') : 'var(--text-muted)',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Tire search */}
              <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '200px' }}>
                <label style={lbl}>צמיג {mvTireId && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}</label>
                <input
                  style={{ ...inp, borderColor: mvTireId ? 'var(--primary)' : undefined }}
                  placeholder="חפש לפי מידה או מותג..."
                  value={mvTireSearch}
                  autoComplete="off"
                  onFocus={() => setMvDropOpen(true)}
                  onBlur={() => setTimeout(() => setMvDropOpen(false), 150)}
                  onChange={e => {
                    const val = e.target.value
                    setMvTireSearch(val)
                    setMvDropOpen(true)
                    setMvQty('')
                    const exact = tires.find(t =>
                      tireSize(t) === val ||
                      (t.brand != null && (t.brand + ' ' + tireSize(t)) === val)
                    )
                    setMvTireId(exact?.id ?? '')
                  }}
                />
                {/* Dropdown – shows on focus (all) or when searching (filtered) */}
                {mvDropOpen && (() => {
                  const q = mvTireSearch.trim().toLowerCase()
                  const matches = q
                    ? tires.filter(t =>
                        tireSize(t).includes(q) ||
                        (t.brand ?? '').toLowerCase().includes(q)
                      ).slice(0, 8)
                    : [...tires].sort((a, b) => (b.qty - a.qty)).slice(0, 10)
                  if (matches.length === 0) return null
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: '2px',
                    }}>
                      {matches.map(t => (
                        <div key={t.id}
                          onMouseDown={() => {
                            const label = (t.brand ? t.brand + ' ' : '') + tireSize(t)
                            setMvTireSearch(label)
                            setMvTireId(t.id)
                            setMvDropOpen(false)
                            setMvQty('')
                          }}
                          style={{
                            padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                            fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                        >
                          <span>
                            {t.brand && <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>{t.brand}</span>}
                            <strong style={{ color: 'var(--accent)' }}>{tireSize(t)}</strong>
                          </span>
                          <span style={{ fontSize: '11px', color: t.qty === 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                            מלאי: {t.qty}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {mvTireId && !mvDropOpen && (() => {
                  const tire = tires.find(x => x.id === mvTireId)
                  return tire ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      מלאי נוכחי: <strong style={{ color: tire.qty === 0 ? 'var(--danger)' : 'var(--primary)' }}>{tire.qty} יח׳</strong>
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
                    {['תאריך', 'צמיג', 'סוג', 'כמות', 'השפעה על מלאי', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>אין תנועות עדיין</td></tr>
                  ) : movements.map(mv => {
                    const tire = tires.find(t => t.id === mv.tire_id)
                    const isSale = mv.movement_type === 'sale'
                    return (
                      <tr key={mv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                          {new Date(mv.sold_date).toLocaleDateString('he-IL')}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {tire ? (
                            <span>
                              {tire.brand && <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '4px' }}>{tire.brand}</span>}
                              <span style={{ color: 'var(--accent)' }}>{tireSize(tire)}</span>
                            </span>
                          ) : '—'}
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
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{mv.qty}</td>
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
        title={editId ? '✏️ עריכת צמיג' : '➕ הוספת צמיג'} maxWidth={620}
        footer={<>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
          <Button onClick={saveForm}>💾 {editId ? 'שמור שינויים' : 'שמור צמיג'}</Button>
        </>}>

        <div style={{ direction: 'rtl', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Section 1 – tire dimensions */}
          <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', marginBottom: '12px' }}>מידות הצמיג</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>רוחב (מ&quot;מ) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select style={inpErr(formErrs.width)} value={form.width}
                  onChange={e => { setF('width', e.target.value); setFormErrs(p => ({ ...p, width: false })) }}>
                  <option value="">— בחר —</option>
                  {WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>פרופיל (%) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select style={inpErr(formErrs.profile)} value={form.profile}
                  onChange={e => { setF('profile', e.target.value); setFormErrs(p => ({ ...p, profile: false })) }}>
                  <option value="">— בחר —</option>
                  {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>קוטר (אינץ') <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select style={inpErr(formErrs.rim)} value={form.rim}
                  onChange={e => { setF('rim', e.target.value); setFormErrs(p => ({ ...p, rim: false })) }}>
                  <option value="">— בחר —</option>
                  {RIMS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div>
                <label style={lbl}>מותג</label>
                <input style={inp} value={form.brand} placeholder="Michelin, Bridgestone..."
                  list="brand-list-modal"
                  onChange={e => setF('brand', e.target.value)} />
                <datalist id="brand-list-modal">
                  {[...new Set(tires.map(t => t.brand).filter(Boolean) as string[])].sort().map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>אינדקס עומס</label>
                <input style={inp} value={form.load_idx} placeholder="91"
                  onChange={e => setF('load_idx', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>אינדקס מהירות</label>
                <input style={inp} value={form.speed_idx} placeholder="V"
                  onChange={e => setF('speed_idx', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Section 2 – pricing & stock */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label style={lbl}>מחיר קנייה (₪ לפני מע&quot;מ)</label>
              <input style={inp} type="number" value={form.cost_price} min={0} step="0.01" placeholder="0.00"
                onChange={e => {
                  setF('cost_price', e.target.value)
                  calcSellPrice(e.target.value, form.margin)
                }} />
              {form.cost_price && !isNaN(parseFloat(form.cost_price)) && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  כולל מע&quot;מ: ₪{(parseFloat(form.cost_price) * 1.18).toFixed(2)}
                </span>
              )}
            </div>
            <div>
              <label style={lbl}>% רווח</label>
              <input style={inp} type="number" value={form.margin} min={0} step="1" placeholder="25"
                onChange={e => {
                  setF('margin', e.target.value)
                  calcSellPrice(form.cost_price, e.target.value)
                }} />
            </div>
            <div>
              <label style={lbl}>מחיר מכירה (₪)</label>
              <input style={inp} type="number" value={form.sell_price} min={0} step="0.01"
                onChange={e => setF('sell_price', e.target.value)} />
              {form.sell_price && !isNaN(parseFloat(form.sell_price)) && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  לפני מע&quot;מ: ₪{(parseFloat(form.sell_price) / 1.18).toFixed(2)}
                </span>
              )}
            </div>
            <div>
              <label style={lbl}>כמות במלאי</label>
              <input style={inp} type="number" value={form.qty} min={0}
                onChange={e => setF('qty', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>מיקום במחסן</label>
              <input style={inp} value={form.location} placeholder="מדף A3"
                onChange={e => setF('location', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>הערות</label>
              <input style={inp} value={form.notes}
                onChange={e => setF('notes', e.target.value)} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: 'blue' | 'orange' | 'red' | 'green' }) {
  const colors = { blue: 'var(--accent)', orange: 'var(--warning)', red: 'var(--danger)', green: 'var(--primary)' }
  const bgs    = { blue: '#eff6ff',       orange: '#fffbeb',        red: '#fef2f2',       green: '#f0fdf4' }
  return (
    <div style={{ background: color ? bgs[color] : '#f0fdf4', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 900, color: color ? colors[color] : 'var(--primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}
