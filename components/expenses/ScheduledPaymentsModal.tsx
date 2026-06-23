'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { SupabaseClient } from '@supabase/supabase-js'

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduledPaymentsModal({
  open, onClose, suppliers, tenantId, supabase, onRefresh, showToast, expenseCats,
}: Props) {
  const [rows,      setRows]      = useState<ScheduledPayment[]>([])
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
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
    const { data } = await supabase
      .from('scheduled_payments')
      .select('*')
      .order('due_date', { ascending: true })
    setRows(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { if (open) fetch() }, [open, fetch])

  // ── Form open ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditItem(null)
    setFDesc(''); setFAmount(''); setFDue(todayIso())
    setFMethod('check'); setFSupplier(''); setFNotes('')
    setFormOpen(true)
  }

  const openEdit = (p: ScheduledPayment) => {
    setEditItem(p)
    setFDesc(p.description); setFAmount(String(p.amount)); setFDue(p.due_date)
    setFMethod(p.payment_method); setFSupplier(p.supplier_id ?? ''); setFNotes(p.notes ?? '')
    setFormOpen(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!fDesc || !fAmount || !fDue) return
    const amount = parseFloat(fAmount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(true)

    const payload = {
      tenant_id: tenantId,
      description: fDesc, amount, due_date: fDue,
      payment_method: fMethod,
      supplier_id: fSupplier || null,
      notes: fNotes || null,
    }

    const res = editItem
      ? await supabase.from('scheduled_payments').update(payload).eq('id', editItem.id)
      : await supabase.from('scheduled_payments').insert(payload)

    setSaving(false)
    if (res.error) { showToast('שגיאה: ' + res.error.message, 'error'); return }
    showToast(editItem ? 'עודכן' : 'נוסף', 'success')
    setFormOpen(false)
    fetch()
    onRefresh?.()
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
        const m = rd.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
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
        title={editItem ? 'עריכת תשלום מתוזמן' : 'תשלום מתוזמן חדש'}
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>ביטול</Button>
            <Button onClick={save} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="תיאור" placeholder="לדוג׳: צ'ק לספק, העברת שכירות..." value={fDesc} onChange={e => setFDesc(e.target.value)} />
          <Input label="סכום" type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} />
          <Input label="תאריך פירעון" type="date" value={fDue} onChange={e => setFDue(e.target.value)} />

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
            <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={SEL}>
              <option value="">— ללא ספק —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
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
    </>
  )
}
