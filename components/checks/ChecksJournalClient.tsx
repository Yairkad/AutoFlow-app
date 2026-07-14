'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ScheduledPaymentsModal from '@/components/expenses/ScheduledPaymentsModal'
import { autoMarkOverdueChecksPaid } from '@/lib/utils/autoMarkOverdueChecks'
import { markScheduledPaymentPaid } from '@/lib/utils/markCheckPaid'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduledPayment {
  id: string; tenant_id: string; description: string; amount: number
  due_date: string; payment_method: 'check' | 'transfer'
  supplier_id: string | null; category: string | null
  is_paid: boolean; paid_date: string | null; expense_id: string | null; notes: string | null
  check_number: string | null; series_id: string | null; allocation_ignored: boolean
}

interface Supplier { id: string; name: string }

type StatusFilter = 'open' | 'paid' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDMY = (d: string | Date) => {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
    if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`
    d = new Date(d)
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const monthKeyOf = (iso: string) => iso.slice(0, 7)
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const fmtMonth = (key: string) => { const [y, m] = key.split('-'); return `${HEB_MONTHS[parseInt(m, 10) - 1]} ${y}` }
const daysUntil = (iso: string) => { const t = new Date(); t.setHours(0, 0, 0, 0); const d = new Date(iso + 'T00:00:00'); d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - t.getTime()) / 86400000) }

const SEL: React.CSSProperties = {
  padding: '8px 12px', fontSize: '13px',
  border: '1.5px solid var(--border)', borderRadius: '9px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChecksJournalClient() {
  const supabase = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const tenantId = profile?.tenantId ?? null
  const tenantName = (profile?.tenant?.name as string | undefined) ?? 'AutoFlow'

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ScheduledPayment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
  const [expenseCats, setExpenseCats] = useState<string[]>(['ספקים', 'אחר'])

  // Filters
  const [fSupplier, setFSupplier] = useState('') // '' = all, '__none__' = no supplier
  const [fNumFrom, setFNumFrom] = useState('')
  const [fNumTo, setFNumTo] = useState('')
  const [fDateFrom, setFDateFrom] = useState('')
  const [fDateTo, setFDateTo] = useState('')
  const [fStatus, setFStatus] = useState<StatusFilter>('open')
  const [fSearch, setFSearch] = useState('')

  const clearFilters = () => {
    setFSupplier(''); setFNumFrom(''); setFNumTo(''); setFDateFrom(''); setFDateTo(''); setFStatus('open'); setFSearch('')
  }

  // Expanded months (membership = user opened it; default all collapsed)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const toggleMonth = (mk: string) => setExpandedMonths(prev => {
    const next = new Set(prev)
    if (next.has(mk)) next.delete(mk); else next.add(mk)
    return next
  })

  // Add / edit modal (reuses ScheduledPaymentsModal for the actual form + series logic)
  const [addOpen, setAddOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false) // opens the modal's own list view (for Excel import)
  const [editItem, setEditItem] = useState<ScheduledPayment | null>(null)

  // Mark-as-paid mini modal
  const [payItem, setPayItem] = useState<ScheduledPayment | null>(null)
  const [payDate, setPayDate] = useState('')
  const [payCat, setPayCat] = useState('')
  const [payDesc, setPayDesc] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    await autoMarkOverdueChecksPaid(supabase, tenantId).catch(() => {})
    const [payRes, suppRes, catRes, linkRes] = await Promise.all([
      supabase.from('scheduled_payments').select('*').eq('tenant_id', tenantId).eq('payment_method', 'check').order('due_date', { ascending: true }),
      supabase.from('suppliers').select('id,name').eq('tenant_id', tenantId).order('name'),
      supabase.from('expense_categories').select('name').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('supplier_debt_payments').select('scheduled_payment_id').eq('tenant_id', tenantId).not('scheduled_payment_id', 'is', null),
    ])
    setRows(payRes.data ?? [])
    setSuppliers(suppRes.data ?? [])
    if (catRes.data && catRes.data.length > 0) setExpenseCats(catRes.data.map(r => r.name))
    setLinkedIds(new Set((linkRes.data ?? []).map(r => r.scheduled_payment_id).filter((id): id is string => !!id)))
    setLoading(false)
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])

  // Deep-link: ?supplier=<id>
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (didAutoOpen.current) return
    didAutoOpen.current = true
    const sid = new URLSearchParams(window.location.search).get('supplier')
    if (sid) setFSupplier(sid)
  }, [])

  // Realtime
  useEffect(() => {
    if (!tenantId) return
    const ch = supabase.channel('checks-journal-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_payments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debt_payments' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, tenantId, load])

  // ── Filtering & grouping ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const numFrom = fNumFrom ? parseInt(fNumFrom, 10) : null
    const numTo = fNumTo ? parseInt(fNumTo, 10) : null
    const q = fSearch.trim().toLowerCase()
    return rows.filter(p => {
      if (fSupplier === '__none__' && p.supplier_id) return false
      if (fSupplier && fSupplier !== '__none__' && p.supplier_id !== fSupplier) return false
      if (numFrom != null || numTo != null) {
        const n = p.check_number ? parseInt(p.check_number, 10) : NaN
        if (isNaN(n)) return false
        if (numFrom != null && n < numFrom) return false
        if (numTo != null && n > numTo) return false
      }
      if (fDateFrom && p.due_date < fDateFrom) return false
      if (fDateTo && p.due_date > fDateTo) return false
      if (fStatus === 'open' && p.is_paid) return false
      if (fStatus === 'paid' && !p.is_paid) return false
      if (q) {
        const supName = suppliers.find(s => s.id === p.supplier_id)?.name ?? ''
        const hay = `${p.description} ${p.notes ?? ''} ${supName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    }).sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.check_number ?? '').localeCompare(b.check_number ?? ''))
  }, [rows, suppliers, fSupplier, fNumFrom, fNumTo, fDateFrom, fDateTo, fStatus, fSearch])

  const monthGroups = useMemo(() => {
    const map: Record<string, ScheduledPayment[]> = {}
    filtered.forEach(p => {
      const mk = monthKeyOf(p.due_date)
      if (!map[mk]) map[mk] = []
      map[mk].push(p)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const grandTotal = filtered.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.amount), 0)

  // ── Row actions ─────────────────────────────────────────────────────────────

  const openPay = (p: ScheduledPayment) => {
    setPayItem(p)
    setPayDate(p.due_date)
    setPayCat(p.category ?? expenseCats[0] ?? 'אחר')
    setPayDesc(p.description)
  }

  const confirmPay = async () => {
    if (!payItem || !payDate || !tenantId) return
    setPaySaving(true)
    const { error } = await markScheduledPaymentPaid(supabase, tenantId, payItem, {
      paidDate: payDate, category: payCat, description: payDesc || payItem.description,
    })
    setPaySaving(false)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    showToast('תשלום סומן כנפרע והוצאה נוצרה ✓', 'success')
    setPayItem(null)
    load()
  }

  const deleteRow = async (id: string) => {
    const ok = await confirm({ msg: "למחוק צ'ק זה?", icon: '🗑️' })
    if (!ok) return
    await supabase.from('scheduled_payments').delete().eq('id', id)
    showToast('נמחק', 'success')
    load()
  }

  // ── Excel export (scoped to the currently filtered rows) ───────────────────

  async function exportExcel() {
    setExporting(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'AutoFlow'
      const ws = wb.addWorksheet("יומן צ'קים", { views: [{ rightToLeft: true }] })

      ws.columns = [{ width: 7.53 }, { width: 14.83 }, { width: 19.66 }, { width: 10.45 }, { width: 25.96 }, { width: 15.51 }]

      const NAVY = '1F497D', LBLUE = 'DCE6F1', LGRAY = 'F2F5F8', WHITE = 'FFFFFF', BLACK = '000000'
      const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: hex } })
      const fnt = (hex: string, bold = false, sz = 11) => ({ bold, size: sz, color: { argb: hex }, name: 'Arial' })
      const aln = (h: 'left' | 'center' | 'right' = 'right') => ({ horizontal: h, vertical: 'middle' as const })

      const titleRow = ws.addRow(["יומן צ'קים", '', '', '', '', ''])
      titleRow.height = 21
      ws.mergeCells('A1:F1')
      titleRow.getCell(1).font = fnt(NAVY, true, 16)
      titleRow.getCell(1).alignment = aln('center')

      const dateRow = ws.addRow(['', '', '', '', '', `תאריך הדפסה: ${new Date().toLocaleDateString('he-IL')}`])
      dateRow.height = 15
      dateRow.getCell(6).font = fnt(BLACK, false, 12)
      dateRow.getCell(6).alignment = aln('center')

      ws.addRow(['', '', '', '', '', ''])

      const hdrRow = ws.addRow(['שולם', 'תאריך פירעון', 'תיאור', "מספר צ'ק", 'ספק', 'סכום'])
      hdrRow.height = 15
      for (let col = 1; col <= 6; col++) {
        hdrRow.getCell(col).fill = fill(NAVY)
        hdrRow.getCell(col).font = fnt(WHITE, true, 11)
        hdrRow.getCell(col).alignment = aln('center')
      }

      let grandTotalX = 0
      const allYears = monthGroups.map(([ym]) => ym.slice(0, 4)).sort()
      const maxYear = allYears[allYears.length - 1] ?? String(new Date().getFullYear())

      for (const [ym, payments] of monthGroups) {
        const [yyyy, mm] = ym.split('-')
        const monthName = HEB_MONTHS[parseInt(mm, 10) - 1]

        const mhRn = ws.rowCount + 1
        const mhRow = ws.addRow([`${monthName} ${yyyy}`, '', '', '', '', ''])
        mhRow.height = 15
        ws.mergeCells(`A${mhRn}:F${mhRn}`)
        mhRow.getCell(1).fill = fill(LBLUE)
        mhRow.getCell(1).font = fnt(NAVY, true, 11)
        mhRow.getCell(1).alignment = aln('right')

        const sorted = [...payments].sort((a, b) => {
          const na = suppliers.find(s => s.id === a.supplier_id)?.name ?? ''
          const nb = suppliers.find(s => s.id === b.supplier_id)?.name ?? ''
          return na.localeCompare(nb, 'he')
        })
        for (const p of sorted) {
          const supplier = suppliers.find(s => s.id === p.supplier_id)?.name ?? ''
          const dataRow = ws.addRow([p.is_paid ? '✓' : '', fmtDMY(p.due_date), p.description, p.check_number ?? '', supplier, Number(p.amount)])
          dataRow.height = 15
          for (let col = 1; col <= 6; col++) {
            dataRow.getCell(col).font = { size: 12, name: 'Arial' }
            dataRow.getCell(col).alignment = aln('right')
          }
          dataRow.getCell(1).alignment = aln('center')
          dataRow.getCell(6).numFmt = '#,##0.00'
          dataRow.getCell(6).alignment = aln('center')
          grandTotalX += Number(p.amount)
        }

        const monthTotal = payments.reduce((s, p) => s + Number(p.amount), 0)
        const subRn = ws.rowCount + 1
        const subRow = ws.addRow([`סה"כ לחודש ${monthName} ${yyyy}`, '', '', '', '', monthTotal])
        subRow.height = 15.75
        ws.mergeCells(`A${subRn}:B${subRn}`)
        for (let col = 1; col <= 6; col++) subRow.getCell(col).fill = fill(LGRAY)
        subRow.getCell(1).font = fnt(BLACK, true, 11)
        subRow.getCell(1).alignment = aln('right')
        subRow.getCell(6).font = fnt(BLACK, true, 11)
        subRow.getCell(6).numFmt = '#,##0.00'
        subRow.getCell(6).alignment = aln('center')

        ws.addRow(['', '', '', '', '', ''])
      }

      const gtRn = ws.rowCount + 1
      const gtRow = ws.addRow(['', `סה"כ כולל לשנת ${maxYear}`, '', '', '', grandTotalX])
      gtRow.height = 28.5
      ws.mergeCells(`B${gtRn}:E${gtRn}`)
      for (let col = 2; col <= 6; col++) gtRow.getCell(col).fill = fill(LGRAY)
      gtRow.getCell(2).font = fnt(BLACK, true, 14)
      gtRow.getCell(2).alignment = aln('center')
      gtRow.getCell(6).font = fnt(BLACK, true, 14)
      gtRow.getCell(6).numFmt = '#,##0.00'
      gtRow.getCell(6).alignment = aln('center')

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = "יומן-צקים.xlsx"; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // ── Print ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!printOpen) return
    const t = setTimeout(() => window.print(), 150)
    const onAfterPrint = () => setPrintOpen(false)
    window.addEventListener('afterprint', onAfterPrint)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', onAfterPrint) }
  }, [printOpen])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><line x1="6" y1="10" x2="12" y2="10" /><path d="M14 14c1-2 2-2 3 0s2 2 3 0" /></svg>}
        iconBg="linear-gradient(135deg,#4338ca,#818cf8)"
        iconShadow="#4338ca44"
        title="יומן צ'קים"
        subtitle="כל הצ'קים לפי חודש — סינון, מעקב ותחזית תשלומים"
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <Button onClick={() => setAddOpen(true)}>+ צ׳ק / סדרה חדשה</Button>
        <button
          onClick={() => setListOpen(true)}
          title="ייבוא Excel"
          style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >📥 ייבוא Excel</button>
        <button
          onClick={exportExcel}
          disabled={exporting || filtered.length === 0}
          title="ייצוא Excel (לפי הסינון הנוכחי)"
          style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', opacity: filtered.length === 0 ? 0.5 : 1 }}
        >{exporting ? 'מכין...' : '📊 ייצוא Excel'}</button>
        <Button variant="secondary" onClick={() => setPrintOpen(true)} disabled={filtered.length === 0}>🖨️ הדפסה</Button>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>מקבל (ספק)</label>
          <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={{ ...SEL, minWidth: 160 }}>
            <option value="">— כל הספקים —</option>
            <option value="__none__">ללא ספק</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>מספר צ׳ק</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input type="number" placeholder="מ-" value={fNumFrom} onChange={e => setFNumFrom(e.target.value)} style={{ ...SEL, width: 80 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>עד</span>
            <input type="number" placeholder="עד" value={fNumTo} onChange={e => setFNumTo(e.target.value)} style={{ ...SEL, width: 80 }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>תאריך פירעון</label>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input type="date" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} style={{ ...SEL, width: 140 }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>עד</span>
            <input type="date" value={fDateTo} onChange={e => setFDateTo(e.target.value)} style={{ ...SEL, width: 140 }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>סטטוס</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['open', 'paid', 'all'] as StatusFilter[]).map(f => (
              <button key={f} onClick={() => setFStatus(f)} style={{
                padding: '7px 14px', border: '1px solid',
                borderColor: fStatus === f ? 'var(--primary)' : 'var(--border)',
                background: fStatus === f ? '#f0fdf6' : 'transparent',
                color: fStatus === f ? 'var(--primary)' : 'var(--text-muted)',
                borderRadius: '20px', fontSize: '12px', fontWeight: fStatus === f ? 600 : 400,
                cursor: 'pointer', transition: 'all .12s',
              }}>{f === 'open' ? 'פתוחים' : f === 'paid' ? 'שולמו' : 'הכל'}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>חיפוש</label>
          <input placeholder="תיאור, הערות, ספק..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={SEL} />
        </div>

        <button onClick={clearFilters} style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
          נקה סינון
        </button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
          לא נמצאו צ׳קים התואמים את הסינון.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>סה״כ עתידי לתשלום (לפי הסינון)</span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(grandTotal)}</span>
          </div>

          {monthGroups.map(([mk, items]) => {
            const monthTotal = items.filter(p => !p.is_paid).reduce((s, p) => s + Number(p.amount), 0)
            const collapsed = !expandedMonths.has(mk)
            return (
              <div key={mk} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <div
                  onClick={() => toggleMonth(mk)}
                  style={{ background: '#f1f5f9', borderBottom: collapsed ? 'none' : '2px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s', fontSize: 11 }}>▾</span>
                    {fmtMonth(mk)}
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>({items.length})</span>
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{fmt(monthTotal)}</span>
                </div>
                {!collapsed && (
                  <div>
                    {items.map((p, i) => {
                      const days = daysUntil(p.due_date)
                      const supName = suppliers.find(s => s.id === p.supplier_id)?.name
                      const unlinked = !p.is_paid && !!p.supplier_id && !p.allocation_ignored && !linkedIds.has(p.id)
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', flexWrap: 'wrap', opacity: p.is_paid ? 0.6 : 1 }}>
                          <span style={{ fontSize: '11px', background: '#fef9c3', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                            צ'ק{p.check_number ? ` #${p.check_number}` : ''}
                          </span>
                          {p.series_id && <span title="חלק מסדרת צ׳קים" style={{ fontSize: 12 }}>📚</span>}
                          {unlinked && (
                            <Link href={`/supplier-tracking?open=${p.supplier_id}`} title="לא משויך לחוב — לשיוך היכנסו למעקב ספקים" style={{ fontSize: 12, textDecoration: 'none' }}>⚠️</Link>
                          )}
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: '90px' }}>{supName ?? '—'}</span>
                          <span style={{ fontSize: '13px', flex: 1, textDecoration: p.is_paid ? 'line-through' : 'none' }}>{p.description}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDMY(p.due_date)}</span>
                          <span style={{ fontWeight: 700, minWidth: '90px', textAlign: 'left' }}>{fmt(p.amount)}</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: p.is_paid ? '#16a34a' : days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : '#2563eb', whiteSpace: 'nowrap', minWidth: 80 }}>
                            {p.is_paid ? `שולם ${p.paid_date ? fmtDMY(p.paid_date) : ''}` : days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'היום!' : `עוד ${days} ימים`}
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {!p.is_paid && (
                              <button onClick={() => openPay(p)} title="סמן כנפרע" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✓</button>
                            )}
                            <button onClick={() => setEditItem(p)} title="עריכה" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: '14px' }}>✏️</button>
                            <button onClick={() => deleteRow(p.id)} title="מחיקה" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontSize: '14px' }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / edit / import — reuses the existing checks modal ── */}
      <ScheduledPaymentsModal
        open={addOpen || listOpen || !!editItem}
        onClose={() => { setAddOpen(false); setListOpen(false); setEditItem(null) }}
        suppliers={suppliers}
        tenantId={tenantId ?? ''}
        supabase={supabase}
        onRefresh={load}
        showToast={showToast}
        expenseCats={expenseCats}
        initialOpenAdd={addOpen}
        initialEditItem={editItem}
      />

      {/* ── Mark as paid ── */}
      <Modal
        open={!!payItem}
        onClose={() => setPayItem(null)}
        title="✓ סמן כנפרע"
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayItem(null)}>ביטול</Button>
            <Button onClick={confirmPay} loading={paySaving}>✅ אשר תשלום</Button>
          </>
        }
      >
        {payItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{payItem.description}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{fmt(Number(payItem.amount))}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>פירעון {fmtDMY(payItem.due_date)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>תאריך תשלום בפועל</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={SEL} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>קטגוריה להוצאה</label>
              <select value={payCat} onChange={e => setPayCat(e.target.value)} style={SEL}>
                {expenseCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>תיאור ההוצאה</label>
              <input value={payDesc} onChange={e => setPayDesc(e.target.value)} placeholder={payItem.description} style={SEL} />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Hidden print area ── */}
      {printOpen && (
        <div id="print-area" style={{ display: 'none' }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              main { height: auto !important; overflow: visible !important; }
              #print-area, #print-area * { visibility: visible; }
              #print-area { display: block !important; position: absolute; top: 0; right: 0; width: 100%; padding: 24px; direction: rtl; }
              #print-area table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
              #print-area th, #print-area td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
              #print-area th { background: #eee; }
              #print-area .print-month-header { font-weight: 700; font-size: 13px; background: #f1f5f9; padding: 6px 8px; margin-top: 14px; border: 1px solid #333; border-bottom: none; }
            }
          `}</style>
          <h2 style={{ margin: '0 0 4px' }}>{tenantName} — יומן צ'קים</h2>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>תאריך הדפסה: {fmtDMY(todayISO())}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>סה&quot;כ כללי: {fmt(filtered.reduce((s, p) => s + Number(p.amount), 0))}</div>
          {monthGroups.map(([mk, items]) => {
            const monthTotal = items.reduce((s, p) => s + Number(p.amount), 0)
            return (
              <div key={mk}>
                <div className="print-month-header">{fmtMonth(mk)} — {items.length} צ׳קים — סה&quot;כ {fmt(monthTotal)}</div>
                <table>
                  <thead><tr><th>ספק</th><th>תיאור</th><th>תאריך פירעון</th><th>מספר צ׳ק</th><th>סכום</th><th>סטטוס</th></tr></thead>
                  <tbody>
                    {items.map(p => (
                      <tr key={p.id}>
                        <td>{suppliers.find(s => s.id === p.supplier_id)?.name ?? '—'}</td>
                        <td>{p.description}</td>
                        <td>{fmtDMY(p.due_date)}</td>
                        <td>{p.check_number ?? ''}</td>
                        <td>{fmt(p.amount)}</td>
                        <td>{p.is_paid ? 'שולם' : 'פתוח'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
