'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import * as XLSX from 'xlsx'
import ExcelMenu from '@/components/ui/ExcelMenu'

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
  sku: string | null
  supplier_id: string | null
  condition: 'new' | 'used'
  tire_type: 'regular' | 'reinforced' | 'commercial'
  created_at: string
}

interface Supplier { id: string; name: string }

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
const LOAD_INDICES  = ['60','62','65','67','69','71','73','75','77','80','82','84','85','86','87','88','89','90','91','92','94','95','96','98','99','100','101','102','103','104','105','106','107','108','109','110','112','114','116','118','120','121','122','124','126']
const SPEED_INDICES = ['B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','H','U','V','W','Y','ZR','Z']

const emptyForm = {
  brand: '', width: '', profile: '', rim: '',
  load_idx: '', speed_idx: '', sku: '',
  cost_price: '', margin: '', sell_price: '',
  qty: '0', location: '', notes: '', supplier_id: '',
  condition: 'new' as 'new' | 'used',
  tire_type: 'regular' as 'regular' | 'reinforced' | 'commercial',
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
  const [isAdmin,  setIsAdmin]    = useState(false)
  const [tires, setTires]         = useState<Tire[]>([])
  const [movements, setMovements] = useState<TireMovement[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [tab, setTab] = useState<'tires' | 'movements'>('tires')

  // Receiving order modal
  const [recvOpen,    setRecvOpen]    = useState(false)
  const [recvSupplier, setRecvSupplier] = useState('')
  const [recvItems,   setRecvItems]   = useState<{ tireId: string; search: string; qty: string; dropOpen: boolean }[]>([
    { tireId: '', search: '', qty: '', dropOpen: false }
  ])
  const [recvSaving,  setRecvSaving]  = useState(false)

  // Filters
  const [search,           setSearch]           = useState('')
  const [filterWidth,      setFilterWidth]      = useState('')
  const [filterProf,       setFilterProf]       = useState('')
  const [filterRim,        setFilterRim]        = useState('')
  const [filterStock,      setFilterStock]      = useState('')
  const [filterCondition,  setFilterCondition]  = useState('')

  // Add/Edit modal
  const [formOpen, setFormOpen] = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [form,     setForm]     = useState(emptyForm)
  const [formErrs, setFormErrs] = useState({ width: false, profile: false, rim: false })

  // Selection + per-row inline edit
  const [selectedTireId, setSelectedTireId] = useState<string | null>(null)
  const [editingTireId,  setEditingTireId]  = useState<string | null>(null)
  const [editMap,        setEditMap]        = useState<Record<string, Partial<Tire>>>({})


  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [{ data: ts }, { data: mvs }, { data: sups }] = await Promise.all([
      sb.from('tires').select('*').eq('tenant_id', tenantId.current).order('created_at', { ascending: false }),
      sb.from('tire_sales').select('*').eq('tenant_id', tenantId.current)
        .order('sold_date', { ascending: false }).limit(300),
      sb.from('suppliers').select('id, name').eq('tenant_id', tenantId.current).order('name'),
    ])
    setTires(ts || [])
    setMovements(mvs || [])
    setSuppliers(sups || [])
  }, [sb])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id, role, allowed_modules').eq('id', user.id).single()
      if (profile) {
        tenantId.current = profile.tenant_id
        const admin   = profile.role === 'admin' || profile.role === 'super_admin'
        setIsAdmin(admin)
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
      if (filterCondition && t.condition !== filterCondition) return false
      if (search) {
        const hay = [t.brand, tireSize(t), t.location, t.notes, t.load_idx, t.speed_idx, t.sku]
          .join(' ').toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => {
      if (a.width   !== b.width)   return a.width   - b.width
      if (a.profile !== b.profile) return a.profile - b.profile
      if (a.rim     !== b.rim)     return a.rim     - b.rim
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

  function calcMargin(sellStr: string, costStr: string) {
    const sell = parseFloat(sellStr)
    const cost = parseFloat(costStr)
    if (sell > 0 && cost > 0)
      setF('margin', Math.round((sell / cost - 1) * 100).toFixed(0))
  }

  function printPriceList() {
    const rows = tires
      .filter(t => (t.sell_price ?? 0) > 0)
      .sort((a, b) => {
        if (a.width   !== b.width)   return a.width   - b.width
        if (a.profile !== b.profile) return a.profile - b.profile
        if (a.rim     !== b.rim)     return a.rim     - b.rim
        return (a.brand || '').localeCompare(b.brand || '')
      })
    if (rows.length === 0) return showToast('אין צמיגים עם מחיר מכירה לייצוא', 'error')
    const rowsHTML = rows.map(t => `
      <tr>
        <td>${tireSize(t)}</td>
        <td>${t.brand || '—'}</td>
        <td style="text-align:center">${t.load_idx || '—'}${t.speed_idx ? ' ' + t.speed_idx : ''}</td>
        <td style="text-align:center">${t.location || '—'}</td>
        <td style="text-align:center;font-weight:700;color:#1a9e5c">₪${t.sell_price!.toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 portrait;margin:12mm}
  body{font-family:'Heebo',Arial,sans-serif;direction:rtl}
  h1{font-size:18pt;font-weight:900;margin-bottom:3mm;text-align:center}
  p{font-size:9pt;color:#666;text-align:center;margin-bottom:5mm}
  table{width:100%;border-collapse:collapse;font-size:10pt}
  thead th{background:#1a9e5c;color:#fff;padding:3mm 4mm;text-align:right;font-weight:700}
  tbody td{padding:2.5mm 4mm;border-bottom:1px solid #e5e7eb}
  tbody tr:nth-child(even){background:#f9fafb}
  @media screen{body{background:#f0f0f0;padding:20px}table{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1);border-radius:8px;overflow:hidden}}
</style></head><body>
<h1>🔘 מחירון צמיגים</h1>
<p>${new Date().toLocaleDateString('he-IL')} · ${rows.length} פריטים</p>
<table>
  <thead><tr><th>מידה</th><th>יצרן</th><th style="text-align:center">מדדים</th><th style="text-align:center">מיקום</th><th style="text-align:center">מחיר מכירה</th></tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
    w.document.write(html)
    w.document.close()
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
      load_idx: t.load_idx || '', speed_idx: t.speed_idx || '', sku: t.sku || '',
      cost_price: t.cost_price != null ? String(t.cost_price) : '',
      margin: t.margin ? String(t.margin) : '',
      sell_price: t.sell_price != null ? String(t.sell_price) : '',
      qty: String(t.qty), location: t.location || '', notes: t.notes || '',
      supplier_id: t.supplier_id || '',
      condition: t.condition ?? 'new',
      tire_type: t.tire_type ?? 'regular',
    })
    setFormErrs({ width: false, profile: false, rim: false })
    setFormOpen(true)
  }

  function openDuplicate(t: Tire) {
    setEditId(null)
    setForm({
      brand: t.brand || '', width: String(t.width), profile: String(t.profile), rim: String(t.rim),
      load_idx: t.load_idx || '', speed_idx: t.speed_idx || '', sku: '',
      cost_price: t.cost_price != null ? String(t.cost_price) : '',
      margin: t.margin ? String(t.margin) : '',
      sell_price: t.sell_price != null ? String(t.sell_price) : '',
      qty: '0', location: t.location || '', notes: t.notes || '', supplier_id: t.supplier_id || '',
      condition: t.condition ?? 'new',
      tire_type: t.tire_type ?? 'regular',
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
      qty:         parseInt(form.qty) || 0,
      location:    form.location.trim() || null,
      notes:       form.notes.trim() || null,
      sku:         form.sku.trim() || null,
      supplier_id: form.supplier_id || null,
      condition:   form.condition,
      tire_type:   form.tire_type,
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

  // ── Receiving order ───────────────────────────────────────────────────────────

  async function saveReceiving() {
    const valid = recvItems.filter(r => r.tireId && parseInt(r.qty) > 0)
    if (valid.length === 0) return showToast('יש להוסיף לפחות צמיג אחד עם כמות', 'error')
    setRecvSaving(true)
    const date = todayISO()
    await Promise.all(valid.map(async r => {
      const qty = parseInt(r.qty)
      await sb.from('tire_sales').insert({
        tenant_id: tenantId.current, tire_id: r.tireId,
        qty, sold_date: date, movement_type: 'order',
      })
      const tire = tires.find(t => t.id === r.tireId)
      if (tire) await sb.from('tires').update({ qty: tire.qty + qty }).eq('id', r.tireId)
    }))
    setRecvSaving(false)
    setRecvOpen(false)
    setRecvItems([{ tireId: '', search: '', qty: '', dropOpen: false }])
    setRecvSupplier('')
    showToast(`קולטו ${valid.length} סוגי צמיגים ✓`, 'success')
    await load()
  }

  // ── ESC handler ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editingTireId) { setEditingTireId(null); setEditMap({}) }
      else setSelectedTireId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [editingTireId])

  // ── Per-row inline edit ───────────────────────────────────────────────────────

  function enterEditForRow(id: string) {
    const t = tires.find(x => x.id === id)
    if (!t) return
    setEditMap({ [id]: { ...t } })
    setEditingTireId(id)
  }

  function setCell(id: string, field: keyof Tire, value: string | number | null) {
    setEditMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveRowEdit(id: string) {
    const t = tires.find(x => x.id === id)
    const e = editMap[id]
    if (!t || !e) { setEditingTireId(null); return }
    await sb.from('tires').update({
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
      sku:        e.sku || null,
      condition:  e.condition ?? 'new',
      tire_type:  e.tire_type ?? 'regular',
    }).eq('id', id)
    showToast('הצמיג עודכן ✓', 'success')
    setEditingTireId(null)
    setEditMap({})
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


  // ── Excel ─────────────────────────────────────────────────────────────────────

  function exportExcel() {
    if (tires.length === 0) return showToast('אין נתונים לייצוא', 'error')
    const headers = ['מותג','מצב','רוחב','פרופיל','קוטר','מידה','אינדקס עומס','אינדקס מהירות','מחיר קנייה','מחיר מכירה','מקט','כמות','מיקום','הערות']
    const rows = tires.map(t => [
      t.brand || '', t.condition === 'used' ? 'משומש' : 'חדש',
      t.width, t.profile, t.rim, tireSize(t),
      t.load_idx || '', t.speed_idx || '',
      t.cost_price ?? '', t.sell_price ?? '',
      t.sku || '',
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

      // Column order (matches export): מותג(0) מצב(1) רוחב(2) פרופיל(3) קוטר(4) מידה(5) עומס(6) מהירות(7) מחיר קנייה(8) מחיר מכירה(9) מקט(10) כמות(11) מיקום(12) הערות(13)
      const inserts = rows.slice(1)
        .filter(r => r[2] && r[3] && r[4])
        .map(r => {
          const cost = parseFloat(String(r[8])) || 0
          const sell = parseFloat(String(r[9])) || 0
          return {
            tenant_id:  tenantId.current,
            brand:      r[0] ? String(r[0]) : null,
            condition:  String(r[1] || '') === 'משומש' ? 'used' : 'new',
            width:      parseInt(String(r[2])) || 0,
            profile:    parseInt(String(r[3])) || 0,
            rim:        parseInt(String(r[4])) || 0,
            load_idx:   r[6] ? String(r[6]) : null,
            speed_idx:  r[7] ? String(r[7]) : null,
            cost_price: cost || null,
            margin:     0,
            sell_price: sell || null,
            sku:        r[10] ? String(r[10]) : null,
            qty:        parseInt(String(r[11])) || 0,
            location:   r[12] ? String(r[12]) : null,
            notes:      r[13] ? String(r[13]) : null,
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

  const selTire = selectedTireId ? tires.find(t => t.id === selectedTireId) ?? null : null

  const cellInp: React.CSSProperties = {
    width: '100%', padding: '4px 6px', border: '1px solid var(--accent)',
    borderRadius: '6px', fontSize: '13px', background: '#eff6ff',
    color: 'var(--text)', boxSizing: 'border-box',
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl' }}>

      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>}
        iconBg="linear-gradient(135deg,#6b7280,#9ca3af)"
        iconShadow="#6b728044"
        title="צמיגים"
        subtitle={viewOnly ? 'מצב צפיה בלבד' : undefined}
        actions={!viewOnly ? <>
          <Button variant="outline" onClick={() => window.location.href = '/yard/receive'}>📦 קבלת סחורה</Button>
          <Button onClick={openAdd}>➕ צמיג חדש</Button>
        </> : undefined}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(130px, calc(50% - 6px)), 1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard label='סוגי צמיג'         value={totalTypes} />
        <StatCard label='יחידות במלאי'       value={totalUnits}           color='blue' />
        <StatCard label='סוגים במלאי'        value={inStock}              color='green' />
        <StatCard label='סוגים שאזלו'        value={outOfStock}           color='red' />
        <StatCard label="יח' נמכרו החודש"   value={soldThisMonth} />
        <StatCard label='הכנסות החודש'       value={fmt(revenueMonth)}    color='blue' />
      </div>

      {/* Tabs – movements tab only for admins */}
      <div className="scroll-x" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
        {(['tires', ...(isAdmin ? ['movements'] : [])] as ('tires' | 'movements')[]).map(t => {
          const label = t === 'tires' ? '🔘 מלאי' : '📊 תנועות מלאי'
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 16px', border: 'none', borderRadius: '8px',
              cursor: 'pointer', fontWeight: tab === t ? 600 : 400, fontSize: '13px',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              transition: 'all .15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>{label}</button>
          )
        })}
      </div>
      </div>

      {/* ══════════ TAB: TIRES ══════════ */}
      {tab === 'tires' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0, display: 'flex', alignItems: 'center' }}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 10, pointerEvents: 'none', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="form-input" style={{ paddingRight: 30 }} placeholder="חיפוש מותג / מידה..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-input" style={{ flex: '1 1 80px', minWidth: 0 }} value={filterWidth} onChange={e => setFilterWidth(e.target.value)}>
              <option value=''>רוחב</option>
              {WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <select className="form-input" style={{ flex: '1 1 80px', minWidth: 0 }} value={filterProf} onChange={e => setFilterProf(e.target.value)}>
              <option value=''>פרופיל</option>
              {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="form-input" style={{ flex: '1 1 75px', minWidth: 0 }} value={filterRim} onChange={e => setFilterRim(e.target.value)}>
              <option value=''>קוטר</option>
              {RIMS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="form-input" style={{ flex: '1 1 90px', minWidth: 0 }} value={filterStock} onChange={e => setFilterStock(e.target.value)}>
              <option value=''>כל המלאי</option>
              <option value='instock'>במלאי</option>
              <option value='out'>אזל</option>
            </select>
            <select className="form-input" style={{ flex: '1 1 90px', minWidth: 0 }} value={filterCondition} onChange={e => setFilterCondition(e.target.value)}>
              <option value=''>חדש + משומש</option>
              <option value='new'>חדש בלבד</option>
              <option value='used'>משומש בלבד</option>
            </select>
            {(search || filterWidth || filterProf || filterRim || filterStock || filterCondition) && (
              <button onClick={() => { setSearch(''); setFilterWidth(''); setFilterProf(''); setFilterRim(''); setFilterStock(''); setFilterCondition('') }}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--danger)', background: '#fef2f2', color: 'var(--danger)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                ✕ נקה
              </button>
            )}
          </div>

          {/* Actions row */}
          {!viewOnly && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
              <Button variant="outline" onClick={printPriceList} style={{ fontSize: '13px' }}>🖨️ מחירון</Button>
              <a href="/tires/inventory-count" style={{ textDecoration: 'none' }}>
                <Button variant="outline" style={{ fontSize: '13px' }}>📦 ספירת מלאי</Button>
              </a>
              <ExcelMenu onExportExcel={exportExcel} onImportExcel={importExcel} />
            </div>
          )}

          {/* SelectionBar */}
          {selTire && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {editingTireId === selTire.id ? (
                <>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', flex: 1 }}>✏️ עריכה מהירה: {selTire.brand ?? ''} {tireSize(selTire)}</span>
                  <Button size="sm" onClick={() => saveRowEdit(selTire.id)}>💾 שמור</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingTireId(null); setEditMap({}) }}>ביטול</Button>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', flex: 1 }}>✓ {selTire.brand ?? ''} {tireSize(selTire)}</span>
                  {!viewOnly && <Button size="sm" variant="secondary" onClick={() => enterEditForRow(selTire.id)}>⚡ עריכה מהירה</Button>}
                  <Button size="sm" variant="secondary" onClick={() => openEdit(selTire)}>✏️ ערוך</Button>
                  <Button size="sm" variant="secondary" onClick={() => openDuplicate(selTire)}>📋 שכפל</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteTire(selTire)}>🗑 מחק</Button>
                </>
              )}
              <button onClick={() => { setSelectedTireId(null); setEditingTireId(null); setEditMap({}) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px' }}>✕</button>
            </div>
          )}

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ overflowX: 'auto', borderRadius: '12px', scrollbarWidth: 'thin' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['מותג', 'מידה', 'מדדים', ...(isAdmin ? ['מחיר קנייה'] : []), 'מחיר מכירה', 'מקט', 'כמות', 'מיקום', 'הערות'].map((h, i) => (
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

                    const isEditing = editingTireId === t.id
                    const tireTypeVal = (e as any).tire_type ?? t.tire_type ?? 'regular'
                    return (
                      <tr key={t.id} className="tr-hover"
                        onClick={() => { if (!isEditing && !viewOnly) setSelectedTireId(selectedTireId === t.id ? null : t.id) }}
                        style={{ borderBottom: '1px solid var(--border)', background: selectedTireId === t.id ? '#eff6ff' : isEditing ? '#fafeff' : undefined, cursor: isEditing || viewOnly ? 'default' : 'pointer' }}>

                        {/* מותג */}
                        <td style={{ padding: '10px 12px', fontWeight: 700, minWidth: isEditing ? '130px' : undefined }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input style={cellInp} value={String(e.brand ?? '')} onChange={ev => setCell(t.id, 'brand', ev.target.value)} list="brand-list-inline" />
                              <button
                                onClick={() => setCell(t.id, 'condition', (e.condition ?? t.condition) === 'used' ? 'new' : 'used')}
                                style={{
                                  fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px',
                                  background: (e.condition ?? t.condition) === 'used' ? '#fef3c7' : '#f0fdf4',
                                  color:      (e.condition ?? t.condition) === 'used' ? '#92400e' : 'var(--primary)',
                                }}>
                                {(e.condition ?? t.condition) === 'used' ? '♻ משומש' : '✓ חדש'}
                              </button>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {([['commercial', 'מסחרי', '#fff7ed', '#c2410c'], ['reinforced', 'מחוזק', '#eff6ff', '#1d4ed8']] as const).map(([val, label, bg, color]) => (
                                  <button key={val}
                                    onClick={() => setCell(t.id, 'tire_type' as keyof Tire, tireTypeVal === val ? 'regular' : val)}
                                    style={{
                                      flex: 1, fontSize: '11px', fontWeight: 700, border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 4px',
                                      background: tireTypeVal === val ? bg : '#f1f5f9',
                                      color: tireTypeVal === val ? color : 'var(--text-muted)',
                                    }}>{label}</button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              {t.brand || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              {t.condition === 'used' && (
                                <span style={{ fontSize: '10px', fontWeight: 700, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px' }}>♻</span>
                              )}
                              {t.tire_type === 'commercial' && (
                                <span style={{ fontSize: '10px', fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '4px', padding: '1px 5px' }}>מסחרי</span>
                              )}
                              {t.tire_type === 'reinforced' && (
                                <span style={{ fontSize: '10px', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 5px' }}>מחוזק</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* מידה */}
                        <td style={{ padding: '10px 12px' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '4px', minWidth: '180px' }}>
                              <input style={{ ...cellInp, width: '52px' }} type="number" value={String(e.width ?? '')} onChange={ev => setCell(t.id, 'width', parseInt(ev.target.value) || 0)} placeholder="רוחב" />
                              <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>/</span>
                              <input style={{ ...cellInp, width: '48px' }} type="number" value={String(e.profile ?? '')} onChange={ev => setCell(t.id, 'profile', parseInt(ev.target.value) || 0)} placeholder="פרופ'" />
                              <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>R</span>
                              <input style={{ ...cellInp, width: '44px' }} type="number" value={String(e.rim ?? '')} onChange={ev => setCell(t.id, 'rim', parseInt(ev.target.value) || 0)} placeholder="קוטר" />
                            </div>
                          ) : (
                            <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--accent)', letterSpacing: '0.5px' }}>
                              {tireSize(t)}
                            </span>
                          )}
                        </td>

                        {/* מדדים */}
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: isEditing ? '130px' : undefined }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input style={{ ...cellInp, width: '54px' }} value={String(e.load_idx ?? '')} onChange={ev => setCell(t.id, 'load_idx', ev.target.value)} placeholder="עומס" />
                              <input style={{ ...cellInp, width: '44px' }} value={String(e.speed_idx ?? '')} onChange={ev => setCell(t.id, 'speed_idx', ev.target.value)} placeholder="מהיר'" />
                            </div>
                          ) : indices}
                        </td>

                        {/* מחיר קנייה */}
                        {isAdmin && <td style={{ padding: '10px 12px', minWidth: isEditing ? '90px' : undefined }}>
                          {isEditing
                            ? <input style={cellInp} type="number" value={String(e.cost_price ?? '')} onChange={ev => setCell(t.id, 'cost_price', parseFloat(ev.target.value) || 0)} />
                            : t.cost_price ? (
                              <>
                                <div>{fmtPrice(t.cost_price)}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(t.cost_price * 1.18).toFixed(2)} עם מע&quot;מ</div>
                              </>
                            ) : '—'}
                        </td>}

                        {/* מחיר מכירה */}
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)', minWidth: isEditing ? '90px' : undefined }}>
                          {isEditing
                            ? <input style={cellInp} type="number" value={String(e.sell_price ?? '')} onChange={ev => setCell(t.id, 'sell_price', parseFloat(ev.target.value) || 0)} />
                            : fmtPrice(t.sell_price)}
                        </td>

                        {/* מקט */}
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: isEditing ? '100px' : undefined }}>
                          {isEditing
                            ? <input style={{ ...cellInp, fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.5px' }}
                                value={String(e.sku ?? '')}
                                onChange={ev => setCell(t.id, 'sku', ev.target.value || null)}
                                placeholder="מקט" />
                            : <span style={{ fontFamily: 'monospace' }}>{t.sku || '—'}</span>}
                        </td>

                        {/* כמות — read-only */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: qtyBg, color: qtyColor, borderRadius: '6px', padding: '3px 8px', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {isOut ? 'אזל' : t.qty}
                          </span>
                        </td>

                        {/* מיקום */}
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', minWidth: isEditing ? '100px' : undefined }}>
                          {isEditing
                            ? <input style={cellInp} value={String(e.location ?? '')} onChange={ev => setCell(t.id, 'location', ev.target.value)} />
                            : t.location || '—'}
                        </td>

                        {/* הערות */}
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: isEditing ? undefined : '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isEditing ? undefined : 'nowrap', minWidth: isEditing ? '120px' : undefined }}>
                          {isEditing
                            ? <input style={cellInp} value={String(e.notes ?? '')} onChange={ev => setCell(t.id, 'notes', ev.target.value)} />
                            : t.notes || '—'}
                        </td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Datalists for inline edit */}
              <datalist id="brand-list-inline">
                {[...new Set(tires.map(t => t.brand).filter(Boolean) as string[])].sort().map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>
        </>
      )}

      {/* ══════════ TAB: MOVEMENTS ══════════ */}
      {tab === 'movements' && isAdmin && (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#1d4ed8' }}>
            📋 תנועות מלאי מוצגות בקריאה בלבד. קליטת סחורה — דרך כפתור <strong>קבלת סחורה</strong>. מכירות — נקלטות אוטומטית מהמסוף ברחבה.
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '14px' }}>
              היסטוריית תנועות ({movements.length})
            </div>
            <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {['תאריך', 'צמיג', 'מקור', 'כמות', 'השפעה על מלאי'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>אין תנועות עדיין</td></tr>
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
                            {isSale ? '🏪 מכירה מהמסוף' : '📦 קליטת סחורה'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{mv.qty}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: isSale ? 'var(--danger)' : 'var(--primary)', fontWeight: 600 }}>
                            {isSale ? `−${mv.qty}` : `+${mv.qty}`}
                          </span>
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
                <label className="form-label">רוחב (מ&quot;מ) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select id="f-width" className={`form-input${formErrs.width ? ' error' : ''}`} value={form.width}
                  onChange={e => { setF('width', e.target.value); setFormErrs(p => ({ ...p, width: false })) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-profile') as HTMLSelectElement)?.focus() } }}>
                  <option value="">— בחר —</option>
                  {WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">פרופיל (%) <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select id="f-profile" className={`form-input${formErrs.profile ? ' error' : ''}`} value={form.profile}
                  onChange={e => { setF('profile', e.target.value); setFormErrs(p => ({ ...p, profile: false })) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-rim') as HTMLSelectElement)?.focus() } }}>
                  <option value="">— בחר —</option>
                  {PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">קוטר (אינץ') <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select id="f-rim" className={`form-input${formErrs.rim ? ' error' : ''}`} value={form.rim}
                  onChange={e => { setF('rim', e.target.value); setFormErrs(p => ({ ...p, rim: false })) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-brand') as HTMLInputElement)?.focus() } }}>
                  <option value="">— בחר —</option>
                  {RIMS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {/* SKU / barcode row */}
            <div style={{ marginTop: '10px' }}>
              <label className="form-label">מקט / ברקוד יצרן</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="f-sku"
                  className="form-input"
                  value={form.sku}
                  onChange={e => setF('sku', e.target.value)}
                  placeholder="סרוק ברקוד או הקלד ידנית..."
                  style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.5px' }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('f-brand')?.focus() } }}
                />
                <button
                  type="button"
                  title="לחץ כאן ואז סרוק ברקוד"
                  onClick={() => document.getElementById('f-sku')?.focus()}
                  style={{
                    width: 40, height: 40, border: '1px solid var(--border)', borderRadius: '8px',
                    background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 28 22" width="20" height="16" fill="currentColor">
                    <rect x="0" y="0" width="2" height="22"/><rect x="4" y="0" width="1" height="22"/>
                    <rect x="7" y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
                    <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
                    <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div>
                <label className="form-label">מותג</label>
                <input id="f-brand" className="form-input" value={form.brand} placeholder="Michelin, Bridgestone..."
                  list="brand-list-modal"
                  onChange={e => setF('brand', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-load') as HTMLSelectElement)?.focus() } }} />
                <datalist id="brand-list-modal">
                  {[...new Set(tires.map(t => t.brand).filter(Boolean) as string[])].sort().map(b => <option key={b} value={b} />)}
                </datalist>
              </div>
              <div>
                <label className="form-label">אינדקס עומס</label>
                <select id="f-load" className="form-input" value={form.load_idx}
                  onChange={e => setF('load_idx', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-speed') as HTMLSelectElement)?.focus() } }}>
                  <option value="">—</option>
                  {LOAD_INDICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">אינדקס מהירות</label>
                <select id="f-speed" className="form-input" value={form.speed_idx}
                  onChange={e => setF('speed_idx', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-cost') as HTMLInputElement)?.focus() } }}>
                  <option value="">—</option>
                  {SPEED_INDICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 – pricing & stock */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label className="form-label">מחיר קנייה (₪ לפני מע&quot;מ)</label>
              <input id="f-cost" className="form-input" type="number" value={form.cost_price} min={0} placeholder="0.00"
                onChange={e => { setF('cost_price', e.target.value); calcSellPrice(e.target.value, form.margin) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-margin') as HTMLInputElement)?.focus() } }} />
              {form.cost_price && !isNaN(parseFloat(form.cost_price)) && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  כולל מע&quot;מ: ₪{(parseFloat(form.cost_price) * 1.18).toFixed(2)}
                </span>
              )}
            </div>
            <div>
              <label className="form-label">% רווח</label>
              <input id="f-margin" className="form-input" type="number" value={form.margin} min={0} placeholder="25"
                onChange={e => { setF('margin', e.target.value); calcSellPrice(form.cost_price, e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-sell') as HTMLInputElement)?.focus() } }} />
            </div>
            <div>
              <label className="form-label">מחיר מכירה (₪)</label>
              <input id="f-sell" className="form-input" type="number" value={form.sell_price} min={0}
                onChange={e => { setF('sell_price', e.target.value); calcMargin(e.target.value, form.cost_price) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-qty') as HTMLInputElement)?.focus() } }} />
              {form.sell_price && !isNaN(parseFloat(form.sell_price)) && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
                  לפני מע&quot;מ: ₪{(parseFloat(form.sell_price) / 1.18).toFixed(2)}
                </span>
              )}
            </div>
            <div>
              <label className="form-label">כמות במלאי</label>
              <input id="f-qty" className="form-input" type="number" value={form.qty} min={0}
                onChange={e => setF('qty', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-location') as HTMLInputElement)?.focus() } }} />
            </div>
            <div>
              <label className="form-label">מיקום במחסן</label>
              <input id="f-location" className="form-input" value={form.location} placeholder="מדף A3"
                onChange={e => setF('location', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById('f-notes') as HTMLInputElement)?.focus() } }} />
            </div>
            <div>
              <label className="form-label">הערות</label>
              <input id="f-notes" className="form-input" value={form.notes}
                onChange={e => setF('notes', e.target.value)} />
            </div>
            <div>
              <label className="form-label">מצב הצמיג</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['new', 'used'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setF('condition', c)} style={{
                    flex: 1, padding: '8px', border: `2px solid ${form.condition === c ? (c === 'used' ? '#f59e0b' : 'var(--primary)') : 'var(--border)'}`,
                    borderRadius: '8px', cursor: 'pointer', fontWeight: form.condition === c ? 700 : 400, fontSize: '13px',
                    background: form.condition === c ? (c === 'used' ? '#fef3c7' : '#f0fdf4') : 'var(--bg)',
                    color: form.condition === c ? (c === 'used' ? '#92400e' : 'var(--primary)') : 'var(--text-muted)',
                    fontFamily: 'inherit',
                  }}>
                    {c === 'new' ? '✓ חדש' : '♻ משומש'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">סוג צמיג</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {([
                  ['regular',    'רגיל',   'var(--border)',  'var(--bg)',    'var(--text-muted)'],
                  ['reinforced', 'מחוזק',  '#bfdbfe',       '#eff6ff',      '#1d4ed8'],
                  ['commercial', 'מסחרי',  '#fed7aa',       '#fff7ed',      '#c2410c'],
                ] as const).map(([val, label, borderColor, bg, color]) => (
                  <button key={val} type="button" onClick={() => setF('tire_type', val)} style={{
                    flex: 1, padding: '8px', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer', borderRadius: '8px',
                    border: `2px solid ${form.tire_type === val ? borderColor : 'var(--border)'}`,
                    background: form.tire_type === val ? bg : 'var(--bg)',
                    color: form.tire_type === val ? color : 'var(--text-muted)',
                    fontWeight: form.tire_type === val ? 700 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            {suppliers.length > 0 && (
              <div>
                <label className="form-label">ספק</label>
                <select className="form-input" value={form.supplier_id} onChange={e => setF('supplier_id', e.target.value)}>
                  <option value="">— ללא ספק —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Receiving Order Modal ── */}
      <Modal open={recvOpen} onClose={() => setRecvOpen(false)}
        title="📦 הזמנה שהתקבלה" maxWidth={560}
        footer={<>
          <Button variant="secondary" onClick={() => setRecvOpen(false)}>ביטול</Button>
          <Button onClick={saveReceiving} loading={recvSaving}>💾 קלוט הזמנה</Button>
        </>}>
        <div style={{ direction: 'rtl', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suppliers.length > 0 && (
            <div>
              <label className="form-label">ספק</label>
              <select className="form-input" value={recvSupplier} onChange={e => setRecvSupplier(e.target.value)}>
                <option value="">— בחר ספק —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: -4 }}>פריטים שהתקבלו:</div>

          {recvItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {/* Tire selector */}
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-input" style={{ borderColor: item.tireId ? 'var(--primary)' : undefined }}
                  placeholder="חפש צמיג..."
                  value={item.search}
                  autoComplete="off"
                  onFocus={() => setRecvItems(p => p.map((r, i) => i === idx ? { ...r, dropOpen: true } : r))}
                  onBlur={() => setTimeout(() => setRecvItems(p => p.map((r, i) => i === idx ? { ...r, dropOpen: false } : r)), 150)}
                  onChange={e => setRecvItems(p => p.map((r, i) => i === idx ? { ...r, search: e.target.value, tireId: '', dropOpen: true } : r))}
                />
                {item.dropOpen && (() => {
                  const q = item.search.trim().toLowerCase()
                  const matches = q
                    ? tires.filter(t => tireSize(t).includes(q) || (t.brand ?? '').toLowerCase().includes(q)).slice(0, 8)
                    : tires.slice(0, 8)
                  if (!matches.length) return null
                  return (
                    <div style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: 2 }}>
                      {matches.map(t => (
                        <div key={t.id} onMouseDown={() => setRecvItems(p => p.map((r, i) => i === idx ? { ...r, tireId: t.id, search: (t.brand ? t.brand + ' ' : '') + tireSize(t), dropOpen: false } : r))}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                          onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                          <span>
                            {t.brand && <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>{t.brand}</span>}
                            <strong style={{ color: 'var(--accent)' }}>{tireSize(t)}</strong>
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>מלאי: {t.qty}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
              {/* Qty */}
              <input className="form-input" style={{ width: 80 }} type="number" min={1} placeholder="כמות"
                value={item.qty} onChange={e => setRecvItems(p => p.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))} />
              {/* Remove */}
              {recvItems.length > 1 && (
                <button onClick={() => setRecvItems(p => p.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 18, paddingTop: 6 }}>✕</button>
              )}
            </div>
          ))}

          <button onClick={() => setRecvItems(p => [...p, { tireId: '', search: '', qty: '', dropOpen: false }])}
            style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
            + הוסף שורה
          </button>
        </div>
      </Modal>
    </div>
  )
}

