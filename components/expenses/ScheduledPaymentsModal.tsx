'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { SupabaseClient } from '@supabase/supabase-js'
import { reconcileSupplierPayment, DebtAllocation } from '@/lib/debts/reconcileSupplierPayment'
import QuickAddSupplierModal, { QuickSupplier } from '@/components/suppliers/QuickAddSupplierModal'
import { autoMarkOverdueChecksPaid } from '@/lib/utils/autoMarkOverdueChecks'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduledPayment {
  id: string
  tenant_id: string
  description: string
  amount: number
  due_date: string        // ISO date YYYY-MM-DD
  payment_method: 'check' | 'transfer'
  supplier_id: string | null
  category: string | null
  is_paid: boolean
  paid_date: string | null
  expense_id: string | null
  notes: string | null
  check_number: string | null
  series_id: string | null
}

interface OpenSupplierDebt {
  id: string
  date: string
  amount: number
  paid: number
}

function monthKeyOf(iso: string) { return iso.slice(0, 7) }
function fmtMonthShort(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

interface Props {
  open: boolean
  onClose: () => void
  suppliers: { id: string; name: string }[]
  tenantId: string
  supabase: SupabaseClient
  onRefresh?: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  expenseCats: string[]
  initialSupplierId?: string
  initialSelectedDebtIds?: string[]
  initialDebtAllocAmounts?: Record<string, string>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('he-IL')
}

function daysUntil(isoDate: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(isoDate + 'T00:00:00'); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function statusInfo(p: ScheduledPayment): { label: string; color: string; bg: string } {
  if (p.is_paid) return { label: 'שולם', color: '#16a34a', bg: '#f0fdf4' }
  const d = daysUntil(p.due_date)
  if (d < 0)  return { label: `באיחור ${Math.abs(d)} ימים`, color: 'var(--danger)', bg: '#fef2f2' }
  if (d === 0) return { label: 'היום!', color: 'var(--danger)', bg: '#fef2f2' }
  if (d <= 7)  return { label: `עוד ${d} ימים`, color: 'var(--warning)', bg: '#fffbeb' }
  if (d <= 30) return { label: `עוד ${d} ימים`, color: '#2563eb', bg: '#eff6ff' }
  return { label: `עוד ${d} ימים`, color: 'var(--text-muted)', bg: '#f8fafc' }
}

// ─── Style constants ──────────────────────────────────────────────────────────

const SEL: React.CSSProperties = {
  padding: '8px 12px', fontSize: '14px',
  border: '1.5px solid var(--border)', borderRadius: '9px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
  width: '100%',
}
const TH: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'right',
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap',
  background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px',
}
const TD: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'right',
  verticalAlign: 'middle', fontSize: '13px', borderBottom: '1px solid #f1f5f9',
}
const ICON_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 6px', borderRadius: '6px', fontSize: '15px', opacity: 0.7,
}

// ─── Form defaults ────────────────────────────────────────────────────────────

function todayIso() { return new Date().toISOString().slice(0, 10) }

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduledPaymentsModal({
  open, onClose, suppliers, tenantId, supabase, onRefresh, showToast, expenseCats, initialSupplierId,
  initialSelectedDebtIds, initialDebtAllocAmounts,
}: Props) {
  const [rows,      setRows]      = useState<ScheduledPayment[]>([])
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  // Form modal
  const [formOpen,  setFormOpen]  = useState(false)
  const [editItem,  setEditItem]  = useState<ScheduledPayment | null>(null)
  const [saving,    setSaving]    = useState(false)

  // Form fields
  const [fDesc,    setFDesc]    = useState('')
  const [fAmount,  setFAmount]  = useState('')
  const [fDue,     setFDue]     = useState('')
  const [fMethod,  setFMethod]  = useState<'check' | 'transfer'>('check')
  const [fSupplier, setFSupplier] = useState('')
  const [fNotes,   setFNotes]   = useState('')
  const [fCheckNumber, setFCheckNumber] = useState('')

  // Series creation mode
  const [fSeriesMode,     setFSeriesMode]     = useState(false)
  const [fSeriesCount,    setFSeriesCount]    = useState('3')
  const [fSeriesInterval, setFSeriesInterval] = useState<'month' | 'days'>('month')
  const [fSeriesDays,     setFSeriesDays]     = useState('30')
  const [fSeriesSplit,    setFSeriesSplit]    = useState<'equal' | 'round'>('equal')
  const [fSeriesRoundAmt, setFSeriesRoundAmt] = useState('')
  const [fSeriesRemainderPos, setFSeriesRemainderPos] = useState<'first' | 'last'>('last')

  // Debt-month allocation (which open supplier debts this check/series settles)
  const [openDebts,      setOpenDebts]      = useState<OpenSupplierDebt[]>([])
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(new Set())
  const [debtAllocAmounts, setDebtAllocAmounts] = useState<Record<string, string>>({})

  // Pay modal
  const [payOpen,   setPayOpen]   = useState(false)
  const [payItem,   setPayItem]   = useState<ScheduledPayment | null>(null)
  const [payDate,   setPayDate]   = useState('')
  const [payCat,    setPayCat]    = useState('')
  const [payDesc,   setPayDesc]   = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const { confirm } = useConfirm()

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetch = useCallback(async () => {
    setLoading(true)
    await autoMarkOverdueChecksPaid(supabase, tenantId).catch(() => {})
    const { data } = await supabase
      .from('scheduled_payments')
      .select('*')
      .order('due_date', { ascending: true })
    setRows(data ?? [])
    setLoading(false)
  }, [supabase, tenantId])

  useEffect(() => { if (open) fetch() }, [open, fetch])

  // ── Open debts for the selected supplier (for debt-month allocation) ───────

  // Carries a debt-selection made in a caller's own payment picker (e.g.
  // SupplierTrackingClient's "☑ שלם הכל") across the redirect into this
  // modal's auto-opened add form, consumed once fetchOpenDebtsAndSeed runs.
  const pendingInitialAllocRef = useRef<{ supplierId: string; ids: string[]; amounts: Record<string, string> } | null>(null)

  const fetchOpenDebtsAndSeed = useCallback(async (supplierId: string) => {
    if (!supplierId) { setOpenDebts([]); setSelectedDebtIds(new Set()); setDebtAllocAmounts({}); return }
    const { data } = await supabase
      .from('supplier_debts')
      .select('id, date, amount, paid')
      .eq('supplier_id', supplierId)
      .eq('is_closed', false)
      .order('date', { ascending: true })
    const debts = data ?? []
    setOpenDebts(debts)

    const pending = pendingInitialAllocRef.current
    if (pending && pending.supplierId === supplierId) {
      const validIds = pending.ids.filter(id => debts.some(d => d.id === id))
      setSelectedDebtIds(new Set(validIds))
      setDebtAllocAmounts(Object.fromEntries(validIds.map(id => {
        const d = debts.find(x => x.id === id)!
        const balance = Number(d.amount) - Number(d.paid)
        return [id, pending.amounts[id] ?? String(balance.toFixed(2))]
      })))
      pendingInitialAllocRef.current = null
    } else {
      setSelectedDebtIds(new Set())
      setDebtAllocAmounts({})
    }
  }, [supabase])

  useEffect(() => {
    if (formOpen) fetchOpenDebtsAndSeed(fSupplier)
  }, [fSupplier, formOpen, fetchOpenDebtsAndSeed])

  const toggleDebtSelected = (debt: OpenSupplierDebt) => {
    setSelectedDebtIds(prev => {
      const next = new Set(prev)
      if (next.has(debt.id)) {
        next.delete(debt.id)
        setDebtAllocAmounts(a => { const c = { ...a }; delete c[debt.id]; return c })
      } else {
        next.add(debt.id)
        const balance = Number(debt.amount) - Number(debt.paid)
        setDebtAllocAmounts(a => ({ ...a, [debt.id]: a[debt.id] ?? String(balance.toFixed(2)) }))
      }
      return next
    })
  }

  const totalAllocated = Array.from(selectedDebtIds).reduce((s, id) => s + (parseFloat(debtAllocAmounts[id] ?? '0') || 0), 0)

  // ── Form open ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditItem(null)
    setFDesc(''); setFAmount(''); setFDue(todayIso())
    setFMethod('check'); setFSupplier(initialSupplierId ?? ''); setFNotes(''); setFCheckNumber('')
    setFSeriesMode(false); setFSeriesCount('3'); setFSeriesInterval('month'); setFSeriesDays('30')
    setFSeriesSplit('equal'); setFSeriesRoundAmt(''); setFSeriesRemainderPos('last')
    setFormOpen(true)
  }

  // Auto-open the add form (pre-filled to the given supplier) when opened this way
  useEffect(() => {
    if (open && initialSupplierId) {
      pendingInitialAllocRef.current = initialSelectedDebtIds && initialSelectedDebtIds.length > 0
        ? { supplierId: initialSupplierId, ids: initialSelectedDebtIds, amounts: initialDebtAllocAmounts ?? {} }
        : null
      openAdd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const openEdit = (p: ScheduledPayment) => {
    setEditItem(p)
    setFDesc(p.description); setFAmount(String(p.amount)); setFDue(p.due_date)
    setFMethod(p.payment_method); setFSupplier(p.supplier_id ?? ''); setFNotes(p.notes ?? '')
    setFCheckNumber(p.check_number ?? '')
    setFSeriesMode(false)
    setFormOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const buildAllocations = (): DebtAllocation[] =>
    Array.from(selectedDebtIds)
      .map(id => ({ supplier_debt_id: id, amount: parseFloat(debtAllocAmounts[id] ?? '0') || 0 }))
      .filter(a => a.amount > 0)

  const save = async () => {
    if (!fDesc || !fAmount || !fDue) return
    const amount = parseFloat(fAmount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(true)

    // ── Editing an existing single payment: simple field update, no reconciliation ──
    if (editItem) {
      const payload = {
        description: fDesc, amount, due_date: fDue,
        payment_method: fMethod, supplier_id: fSupplier || null,
        notes: fNotes || null, check_number: fCheckNumber || null,
      }
      const res = await supabase.from('scheduled_payments').update(payload).eq('id', editItem.id)
      setSaving(false)
      if (res.error) { showToast('שגיאה: ' + res.error.message, 'error'); return }
      showToast('עודכן', 'success')
      setFormOpen(false)
      onClose()
      fetch(); onRefresh?.()
      return
    }

    // ── New series of checks ─────────────────────────────────────────────────
    if (fSeriesMode) {
      const n = parseInt(fSeriesCount, 10)
      if (!n || n < 1) { setSaving(false); showToast('מספר צ׳קים לא תקין', 'error'); return }
      const baseCheckNum = fCheckNumber.trim() && /^\d+$/.test(fCheckNumber.trim()) ? parseInt(fCheckNumber.trim(), 10) : null
      const seriesId = crypto.randomUUID()
      const rowsToInsert = []
      for (let i = 0; i < n; i++) {
        let amt: number
        if (fSeriesSplit === 'equal') {
          amt = Math.round((amount / n) * 100) / 100
        } else {
          const roundAmt = parseFloat(fSeriesRoundAmt) || 0
          const isRemainderCheck = fSeriesRemainderPos === 'first' ? i === 0 : i === n - 1
          amt = isRemainderCheck ? Math.round((amount - roundAmt * (n - 1)) * 100) / 100 : roundAmt
        }
        const dueDate = new Date(fDue + 'T00:00:00')
        if (fSeriesInterval === 'month') dueDate.setMonth(dueDate.getMonth() + i)
        else dueDate.setDate(dueDate.getDate() + (parseInt(fSeriesDays, 10) || 30) * i)
        rowsToInsert.push({
          tenant_id: tenantId, description: fDesc, amount: amt,
          due_date: toLocalISODate(dueDate),
          payment_method: fMethod, supplier_id: fSupplier || null, notes: fNotes || null,
          check_number: baseCheckNum !== null ? String(baseCheckNum + i) : null,
          series_id: seriesId,
        })
      }
      // Fix rounding drift in equal-split mode so the sum is exact
      if (fSeriesSplit === 'equal') {
        const sum = rowsToInsert.reduce((s, r) => s + r.amount, 0)
        rowsToInsert[rowsToInsert.length - 1].amount = Math.round((rowsToInsert[rowsToInsert.length - 1].amount + (amount - sum)) * 100) / 100
      }

      const insRes = await supabase.from('scheduled_payments').insert(rowsToInsert).select('id')
      if (insRes.error) { setSaving(false); showToast('שגיאה: ' + insRes.error.message, 'error'); return }

      const allocations = buildAllocations()
      if (allocations.length > 0) {
        const primaryId = insRes.data?.[0]?.id ?? null
        const { error: reconErr } = await reconcileSupplierPayment(supabase, tenantId, allocations, primaryId)
        if (reconErr) { showToast('הצ׳קים נשמרו, אך שיבוץ החוב נכשל: ' + reconErr, 'error') }
      }

      setSaving(false)
      showToast(`${n} צ׳קים נוצרו ✓`, 'success')
      setFormOpen(false)
      onClose()
      fetch(); onRefresh?.()
      return
    }

    // ── New single payment ───────────────────────────────────────────────────
    const payload = {
      tenant_id: tenantId,
      description: fDesc, amount, due_date: fDue,
      payment_method: fMethod,
      supplier_id: fSupplier || null,
      notes: fNotes || null,
      check_number: fCheckNumber || null,
    }
    const insRes = await supabase.from('scheduled_payments').insert(payload).select('id').single()
    if (insRes.error) { setSaving(false); showToast('שגיאה: ' + insRes.error.message, 'error'); return }

    const allocations = buildAllocations()
    if (allocations.length > 0) {
      const { error: reconErr } = await reconcileSupplierPayment(supabase, tenantId, allocations, insRes.data.id)
      if (reconErr) { showToast('התשלום נשמר, אך שיבוץ החוב נכשל: ' + reconErr, 'error') }
    }

    setSaving(false)
    showToast('נוסף', 'success')
    setFormOpen(false)
    onClose()
    fetch(); onRefresh?.()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const del = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק תשלום מתוזמן זה?', icon: '🗑️' })
    if (!ok) return
    await supabase.from('scheduled_payments').delete().eq('id', id)
    showToast('נמחק', 'success')
    fetch()
    onRefresh?.()
  }

  // ── Mark as paid ───────────────────────────────────────────────────────────

  const openPay = (p: ScheduledPayment) => {
    setPayItem(p)
    setPayDate(p.due_date)
    setPayCat(p.category ?? expenseCats[0] ?? 'אחר')
    setPayDesc(p.description)
    setPayOpen(true)
  }

  const markPaid = async () => {
    if (!payItem || !payDate) return
    setPaySaving(true)

    // Create expense entry
    const expRes = await supabase.from('expenses').insert({
      tenant_id:      tenantId,
      date:           payDate,
      category:       payCat,
      description:    payDesc || payItem.description,
      amount:         payItem.amount,
      supplier_id:    payItem.supplier_id,
      payment_method: payItem.payment_method === 'check' ? "צ'ק" : 'העברה',
      payment_ref:    payItem.notes || null,
    }).select('id').single()

    if (expRes.error) { showToast('שגיאה ביצירת הוצאה: ' + expRes.error.message, 'error'); setPaySaving(false); return }

    // Mark payment as paid
    await supabase.from('scheduled_payments').update({
      is_paid: true, paid_date: payDate, expense_id: expRes.data.id,
    }).eq('id', payItem.id)

    setPaySaving(false)
    showToast('תשלום סומן כנפרע והוצאה נוצרה ✓', 'success')
    setPayOpen(false)
    fetch()
    onRefresh?.()
  }

  // ── Excel export (exceljs – matches user's exact design) ────────────────────

  async function exportExcel() {
    setExporting(true)
    try {
      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'AutoFlow'
      const ws = wb.addWorksheet('תשלומים', { views: [{ rightToLeft: true }] })

      // RTL column order A=right: שולם | תאריך פירעון | תיאור | מספר צ'ק | ספק | סכום
      ws.columns = [
        { width: 7.53  }, // A: שולם
        { width: 14.83 }, // B: תאריך פירעון
        { width: 19.66 }, // C: תיאור
        { width: 10.45 }, // D: מספר צ'ק
        { width: 25.96 }, // E: ספק
        { width: 15.51 }, // F: סכום
      ]

      const NAVY  = '1F497D'
      const LBLUE = 'DCE6F1'
      const LGRAY = 'F2F5F8'
      const WHITE = 'FFFFFF'
      const BLACK = '000000'

      const fill = (hex: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: hex } })
      const fnt  = (hex: string, bold = false, sz = 11) => ({ bold, size: sz, color: { argb: hex }, name: 'Arial' })
      const aln  = (h: 'left' | 'center' | 'right' = 'right') => ({ horizontal: h, vertical: 'middle' as const })

      // ── Row 1: Title — no bg fill, NAVY text, bold, size 16, height 21
      const titleRow = ws.addRow(['ריכוז ותחזית תשלומים עתידיים', '', '', '', '', ''])
      titleRow.height = 21
      ws.mergeCells('A1:F1')
      titleRow.getCell(1).font      = fnt(NAVY, true, 16)
      titleRow.getCell(1).alignment = aln('center')

      // ── Row 2: Print date in col F only, size 12
      const dateRow = ws.addRow(['', '', '', '', '', `תאריך הדפסה: ${new Date().toLocaleDateString('he-IL')}`])
      dateRow.height = 15
      dateRow.getCell(6).font      = fnt(BLACK, false, 12)
      dateRow.getCell(6).alignment = aln('center')

      // ── Row 3: Empty
      ws.addRow(['', '', '', '', '', ''])

      // ── Row 4: Column headers — NAVY bg, white bold size 11, height 15
      const hdrRow = ws.addRow(['שולם', 'תאריך פירעון', 'תיאור', "מספר צ'ק", 'ספק', 'סכום'])
      hdrRow.height = 15
      for (let col = 1; col <= 6; col++) {
        hdrRow.getCell(col).fill      = fill(NAVY)
        hdrRow.getCell(col).font      = fnt(WHITE, true, 11)
        hdrRow.getCell(col).alignment = aln('center')
      }

      // ── Group by YYYY-MM
      const HMONTHS = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

      const grouped = rows.reduce<Record<string, ScheduledPayment[]>>((acc, r) => {
        const ym = r.due_date.slice(0, 7)
        if (!acc[ym]) acc[ym] = []
        acc[ym].push(r)
        return acc
      }, {})

      let grandTotal = 0
      const allYears = Object.keys(grouped).map(ym => ym.slice(0, 4)).sort()
      const maxYear  = allYears[allYears.length - 1] ?? String(new Date().getFullYear())

      for (const [ym, payments] of Object.entries(grouped).sort()) {
        const [yyyy, mm] = ym.split('-')
        const monthName  = HMONTHS[parseInt(mm, 10)]

        // Month header: merged A:F, LBLUE bg, NAVY bold size 11, height 15
        const mhRn  = ws.rowCount + 1
        const mhRow = ws.addRow([`${monthName} ${yyyy}`, '', '', '', '', ''])
        mhRow.height = 15
        ws.mergeCells(`A${mhRn}:F${mhRn}`)
        mhRow.getCell(1).fill      = fill(LBLUE)
        mhRow.getCell(1).font      = fnt(NAVY, true, 11)
        mhRow.getCell(1).alignment = aln('right')

        // Data rows: no fill, size 12, sorted by supplier so same-supplier rows are consecutive
        const sortedPayments = [...payments].sort((a, b) => {
          const na = suppliers.find(s => s.id === a.supplier_id)?.name ?? ''
          const nb = suppliers.find(s => s.id === b.supplier_id)?.name ?? ''
          return na.localeCompare(nb, 'he')
        })
        for (const p of sortedPayments) {
          const supplier = suppliers.find(s => s.id === p.supplier_id)?.name ?? ''
          const dataRow  = ws.addRow([
            p.is_paid ? '✓' : '',
            fmtDate(p.due_date),
            p.description,
            p.notes ?? '',
            supplier,
            Number(p.amount),
          ])
          dataRow.height = 15
          for (let col = 1; col <= 6; col++) {
            dataRow.getCell(col).font      = { size: 12, name: 'Arial' }
            dataRow.getCell(col).alignment = aln('right')
          }
          dataRow.getCell(1).alignment = aln('center')
          dataRow.getCell(6).numFmt    = '#,##0.00'
          dataRow.getCell(6).alignment = aln('center')
          grandTotal += Number(p.amount)
        }

        // Subtotal: A:B merged with label (LGRAY), C:E empty (LGRAY), F amount (LGRAY, BLACK bold 11)
        const monthTotal = payments.reduce((s, p) => s + Number(p.amount), 0)
        const subRn      = ws.rowCount + 1
        const subRow     = ws.addRow([`סה"כ לחודש ${monthName} ${yyyy}`, '', '', '', '', monthTotal])
        subRow.height    = 15.75
        ws.mergeCells(`A${subRn}:B${subRn}`)
        for (let col = 1; col <= 6; col++) {
          subRow.getCell(col).fill = fill(LGRAY)
        }
        subRow.getCell(1).font      = fnt(BLACK, true, 11)
        subRow.getCell(1).alignment = aln('right')
        subRow.getCell(6).font      = fnt(BLACK, true, 11)
        subRow.getCell(6).numFmt    = '#,##0.00'
        subRow.getCell(6).alignment = aln('center')

        // Empty separator
        ws.addRow(['', '', '', '', '', ''])
      }

      // ── Grand total: A empty (no bg), B:E merged label (LGRAY bold 14), F amount (LGRAY bold 14)
      const gtRn  = ws.rowCount + 1
      const gtRow = ws.addRow(['', `סה"כ כולל לשנת ${maxYear}`, '', '', '', grandTotal])
      gtRow.height = 28.5
      ws.mergeCells(`B${gtRn}:E${gtRn}`)
      for (let col = 2; col <= 6; col++) {
        gtRow.getCell(col).fill = fill(LGRAY)
      }
      gtRow.getCell(2).font      = fnt(BLACK, true, 14)
      gtRow.getCell(2).alignment = aln('center')
      gtRow.getCell(6).font      = fnt(BLACK, true, 14)
      gtRow.getCell(6).numFmt    = '#,##0.00'
      gtRow.getCell(6).alignment = aln('center')

      // ── Download
      const buf  = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'תחזית-תשלומים.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // ── Excel import ───────────────────────────────────────────────────────────

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })

    // Deduplicate against existing rows (description|due_date|amount)
    const existing = new Set(rows.map(r => `${r.description}|${r.due_date}|${r.amount}`))

    type NewPayment = {
      tenant_id: string; description: string; amount: number
      due_date: string; payment_method: 'check' | 'transfer'; notes: string | null
    }
    const toInsert: NewPayment[] = []

    for (const row of raw) {
      const r = row as unknown[]
      const description = String(r[2] ?? '').trim()
      const rawAmount   = Number(r[5]) // col F = סכום

      if (!description || isNaN(rawAmount) || rawAmount <= 0) continue
      if (description === 'תיאור') continue                          // column header row
      if (String(r[0] ?? '').startsWith('סה"כ')) continue           // subtotal / grand total rows
      if (String(r[0] ?? '') === 'שולם') continue                   // column header row (alt check)

      // Parse date from col B — Date object (cellDates:true), string "DD/MM/YYYY", or Excel serial
      let isoDate = ''
      const rd = r[1]
      if (rd instanceof Date) {
        isoDate = rd.toISOString().slice(0, 10)
      } else if (typeof rd === 'string') {
        const m = rd.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/)
        if (m) isoDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      } else if (typeof rd === 'number') {
        const d = new Date(Math.round((rd - 25569) * 86400000))
        isoDate = d.toISOString().slice(0, 10)
      }
      if (!isoDate) continue

      const notes  = String(r[3] ?? '').trim() || null   // col D = מספר צ'ק
      const method: 'check' | 'transfer' = notes ? 'check' : 'transfer'
      const key    = `${description}|${isoDate}|${rawAmount}`
      if (existing.has(key)) continue  // skip duplicate

      toInsert.push({ tenant_id: tenantId, description, amount: rawAmount, due_date: isoDate, payment_method: method, notes })
    }

    if (toInsert.length === 0) {
      showToast('לא נמצאו שורות חדשות לייבוא', 'info')
      return
    }

    const { error } = await supabase.from('scheduled_payments').insert(toInsert)
    if (error) { showToast('שגיאה: ' + error.message, 'error'); return }
    showToast(`יובאו ${toInsert.length} תשלומים חדשים ✓`, 'success')
    fetch()
    onRefresh?.()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const unpaid  = rows.filter(r => !r.is_paid)
  const paid    = rows.filter(r => r.is_paid)
  const totalUnpaid = unpaid.reduce((s, r) => s + Number(r.amount), 0)

  const formAmount = parseFloat(fAmount) || 0
  const debtsByMonth = (() => {
    const map: Record<string, OpenSupplierDebt[]> = {}
    openDebts.forEach(d => {
      const mk = monthKeyOf(d.date)
      if (!map[mk]) map[mk] = []
      map[mk].push(d)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── List modal ───────────────────────────────────────────────────────── */}
      <Modal
        open={open && !formOpen && !payOpen}
        onClose={onClose}
        title="📅 תשלומים מתוזמנים"
        maxWidth={780}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {unpaid.length > 0 && (
                <>
                  <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(totalUnpaid)}</span>
                  &nbsp;עתידי ל-{unpaid.length} תשלומים
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input ref={importRef} type="file" accept=".xlsx,.xls" onChange={importExcel} style={{ display: 'none' }} />
              <button
                onClick={() => importRef.current?.click()}
                title="ייבא מאקסל"
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: '1px solid #2563eb',
                  background: '#eff6ff', color: '#2563eb', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📥 ייבא Excel
              </button>
              {rows.length > 0 && (
                <button
                  onClick={exportExcel}
                  disabled={exporting}
                  title="ייצא לאקסל"
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #16a34a',
                    background: '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: 600,
                    cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1,
                  }}
                >
                  {exporting ? 'מכין...' : '📊 ייצא Excel'}
                </button>
              )}
              <Button size="sm" onClick={openAdd}>+ הוסף תשלום</Button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {Array(4).fill(0).map((_, i) => <div key={i} style={{ height: 44, background: '#f1f5f9', borderRadius: '8px' }} />)}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
              אין תשלומים מתוזמנים. לחץ &quot;+ הוסף תשלום&quot; כדי להתחיל.
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={TH}>תיאור</th>
                    <th style={TH}>סכום</th>
                    <th style={TH}>תאריך פירעון</th>
                    <th style={TH}>אמצעי</th>
                    <th style={TH}>ספק</th>
                    <th style={TH}>סטטוס</th>
                    <th style={{ ...TH, width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Unpaid first */}
                  {unpaid.map(p => {
                    const st = statusInfo(p)
                    return (
                      <tr key={p.id} className="tr-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 500 }}>
                          {p.description}
                          {p.check_number && <span style={{ marginRight: 6, fontSize: '11px', color: 'var(--text-muted)' }}>#{p.check_number}</span>}
                          {p.series_id && <span title="חלק מסדרת צ׳קים" style={{ marginRight: 6, fontSize: '11px' }}>📚</span>}
                          {p.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{p.notes}</div>}
                        </td>
                        <td style={{ ...TD, fontWeight: 700, color: 'var(--danger)' }}>{fmt(Number(p.amount))}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(p.due_date)}</td>
                        <td style={TD}>
                          <span style={{ fontSize: '12px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', borderRadius: '6px', padding: '2px 8px' }}>
                            {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-muted)' }}>
                          {suppliers.find(s => s.id === p.supplier_id)?.name || '—'}
                        </td>
                        <td style={TD}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: st.color, background: st.bg, borderRadius: '6px', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => openPay(p)}
                            title="סמן כנפרע"
                            style={{ ...ICON_BTN, fontSize: '13px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '6px', padding: '3px 8px', opacity: 1, fontWeight: 600 }}
                          >
                            ✓ שולם
                          </button>
                          <button onClick={() => openEdit(p)} style={ICON_BTN} title="עריכה">✏️</button>
                          <button onClick={() => del(p.id)}   style={ICON_BTN} title="מחיקה">🗑️</button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* Separator if there are paid rows */}
                  {paid.length > 0 && unpaid.length > 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '6px 14px', background: '#f8fafc', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        — שולמו —
                      </td>
                    </tr>
                  )}

                  {/* Paid rows */}
                  {paid.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: 0.55 }}>
                      <td style={{ ...TD, textDecoration: 'line-through', color: 'var(--text-muted)' }}>{p.description}</td>
                      <td style={{ ...TD, fontWeight: 600, color: 'var(--text-muted)' }}>{fmt(Number(p.amount))}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(p.due_date)}</td>
                      <td style={TD}>
                        <span style={{ fontSize: '12px', background: '#f1f5f9', color: 'var(--text-muted)', borderRadius: '6px', padding: '2px 8px' }}>
                          {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                        </span>
                      </td>
                      <td style={{ ...TD, color: 'var(--text-muted)' }}>
                        {suppliers.find(s => s.id === p.supplier_id)?.name || '—'}
                      </td>
                      <td style={TD}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: '6px', padding: '3px 8px' }}>
                          שולם {p.paid_date ? fmtDate(p.paid_date) : ''}
                        </span>
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <button onClick={() => del(p.id)} style={ICON_BTN} title="מחיקה">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Add / Edit form modal ─────────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editItem ? 'עריכת תשלום מתוזמן' : fSeriesMode ? 'סדרת צ׳קים חדשה' : 'תשלום מתוזמן חדש'}
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={save} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!editItem && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {([[false, '📝 צ׳ק בודד'], [true, '📚 סדרת צ׳קים']] as [boolean, string][]).map(([v, label]) => (
                <button key={String(v)} type="button" onClick={() => setFSeriesMode(v)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                  border: `2px solid ${fSeriesMode === v ? '#0369a1' : 'var(--border)'}`,
                  background: fSeriesMode === v ? '#e0f2fe' : '#fff',
                  color: fSeriesMode === v ? '#0369a1' : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>
          )}

          <Input label="תיאור" placeholder="לדוג׳: צ'ק לספק, העברת שכירות..." value={fDesc} onChange={e => setFDesc(e.target.value)} />
          <Input label={fSeriesMode ? 'סכום כולל לסדרה' : 'סכום'} type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} />

          {fSeriesMode ? (
            <>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Input label="מספר צ׳קים" type="number" min="1" step="1" value={fSeriesCount} onChange={e => setFSeriesCount(e.target.value)} />
                <Input label="תאריך פירעון ראשון" type="date" value={fDue} onChange={e => setFDue(e.target.value)} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>מרווח בין צ׳קים</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {(['month', 'days'] as const).map(iv => (
                    <button key={iv} type="button" onClick={() => setFSeriesInterval(iv)} style={{
                      padding: '7px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                      border: `1px solid ${fSeriesInterval === iv ? 'var(--primary)' : 'var(--border)'}`,
                      background: fSeriesInterval === iv ? '#f0fdf4' : '#f8fafc',
                      color: fSeriesInterval === iv ? 'var(--primary)' : 'var(--text-muted)',
                    }}>{iv === 'month' ? 'כל חודש' : 'כל X ימים'}</button>
                  ))}
                  {fSeriesInterval === 'days' && (
                    <input type="number" min="1" value={fSeriesDays} onChange={e => setFSeriesDays(e.target.value)} style={{ ...SEL, width: 80 }} />
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500 }}>חלוקת הסכום</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['equal', 'round'] as const).map(sp => (
                    <button key={sp} type="button" onClick={() => setFSeriesSplit(sp)} style={{
                      flex: 1, padding: '7px 8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                      border: `1px solid ${fSeriesSplit === sp ? 'var(--primary)' : 'var(--border)'}`,
                      background: fSeriesSplit === sp ? '#f0fdf4' : '#f8fafc',
                      color: fSeriesSplit === sp ? 'var(--primary)' : 'var(--text-muted)',
                    }}>{sp === 'equal' ? 'חלוקה שווה' : 'סכום עגול + שארית'}</button>
                  ))}
                </div>
              </div>

              {fSeriesSplit === 'round' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <Input label="סכום קבוע לצ׳ק" type="number" prefix="₪" step="0.01" value={fSeriesRoundAmt} onChange={e => setFSeriesRoundAmt(e.target.value)} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500 }}>השארית ב-</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['first', 'last'] as const).map(pos => (
                        <button key={pos} type="button" onClick={() => setFSeriesRemainderPos(pos)} style={{
                          padding: '7px 10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                          border: `1px solid ${fSeriesRemainderPos === pos ? 'var(--primary)' : 'var(--border)'}`,
                          background: fSeriesRemainderPos === pos ? '#f0fdf4' : '#f8fafc',
                          color: fSeriesRemainderPos === pos ? 'var(--primary)' : 'var(--text-muted)',
                        }}>{pos === 'first' ? 'ראשון' : 'אחרון'}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Input label="מספר צ׳ק ראשון (אופציונלי, מספרי → ממשיך אוטומטית)" value={fCheckNumber} onChange={e => setFCheckNumber(e.target.value)} />
            </>
          ) : (
            <>
              <Input label="תאריך פירעון" type="date" value={fDue} onChange={e => setFDue(e.target.value)} />
              {fMethod === 'check' && (
                <Input label="מספר צ׳ק (אופציונלי)" value={fCheckNumber} onChange={e => setFCheckNumber(e.target.value)} />
              )}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>אמצעי תשלום</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['check', 'transfer'] as const).map(m => (
                <button key={m} type="button" onClick={() => setFMethod(m)} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                  border: `1px solid ${fMethod === m ? 'var(--primary)' : 'var(--border)'}`,
                  background: fMethod === m ? '#f0fdf4' : '#f8fafc',
                  color: fMethod === m ? 'var(--primary)' : 'var(--text-muted)',
                }}>
                  {m === 'check' ? "📝 צ'ק" : '🏦 העברה בנקאית'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>ספק (אופציונלי)</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={SEL}>
                <option value="">— ללא ספק —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowQuickAddSupplier(true)}
                title="הוסף ספק חדש"
                style={{ padding: '0 12px', border: '1px solid var(--border)', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', color: 'var(--primary)', flexShrink: 0 }}
              >＋</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>הערות (אופציונלי)</label>
            <input
              type="text"
              placeholder="מספר צ'ק, פרטי העברה..."
              value={fNotes}
              onChange={e => setFNotes(e.target.value)}
              style={{ ...SEL }}
            />
          </div>

          {/* ── Debt-month allocation: which open debts does this check/series settle ── */}
          {!editItem && fSupplier && openDebts.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>שיבוץ מול חובות פתוחים של הספק (אופציונלי)</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>סמן אילו חודשים התשלום הזה סוגר. חודש שלא תסמן לא ייגע כלל.</div>
              {debtsByMonth.map(([mk, debts]) => (
                <div key={mk} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>{fmtMonthShort(mk)}</div>
                  {debts.map(d => {
                    const balance = Number(d.amount) - Number(d.paid)
                    const checked = selectedDebtIds.has(d.id)
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleDebtSelected(d)} />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-muted)' }}>יתרה פתוחה: {fmt(balance)}</span>
                        {checked && (
                          <input
                            type="number" step="0.01"
                            value={debtAllocAmounts[d.id] ?? ''}
                            onChange={e => setDebtAllocAmounts(a => ({ ...a, [d.id]: e.target.value }))}
                            style={{ width: 90, padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              {selectedDebtIds.size > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, color: Math.abs(totalAllocated - formAmount) > 0.01 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  סה״כ משובץ: {fmt(totalAllocated)} מתוך {fmt(formAmount)}
                  {Math.abs(totalAllocated - formAmount) > 0.01 && ' — שים לב לפער'}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Mark as paid modal ───────────────────────────────────────────────── */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="✓ סמן כנפרע"
        maxWidth={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>ביטול</Button>
            <Button onClick={markPaid} loading={paySaving}>✅ אשר תשלום</Button>
          </>
        }
      >
        {payItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Payment summary */}
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{payItem.description}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{fmt(Number(payItem.amount))}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {payItem.payment_method === 'check' ? "צ'ק" : 'העברה בנקאית'} • פירעון {fmtDate(payItem.due_date)}
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#fef9ec', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
              ✨ תשלום זה יסומן כנפרע ותיווצר הוצאה בהתאם בדף ההוצאות.
            </div>

            <Input
              label="תאריך תשלום בפועל"
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>קטגוריה להוצאה</label>
              <select value={payCat} onChange={e => setPayCat(e.target.value)} style={SEL}>
                {expenseCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <Input
              label="תיאור ההוצאה"
              value={payDesc}
              onChange={e => setPayDesc(e.target.value)}
              placeholder={payItem.description}
            />
          </div>
        )}
      </Modal>

      <QuickAddSupplierModal
        open={showQuickAddSupplier}
        onClose={() => setShowQuickAddSupplier(false)}
        tenantId={tenantId}
        supabase={supabase}
        showToast={showToast}
        onCreated={(s: QuickSupplier) => { setFSupplier(s.id); onRefresh?.() }}
      />
    </>
  )
}
