'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { recordCustomerPayment } from '@/lib/debts/reconcileCustomerLedgerPayment'
import { balanceOf, buildLedger, RawLedgerEvent } from '@/lib/debts/ledger'
import QuickAddCustomerModal, { QuickCustomer } from '@/components/customers/QuickAddCustomerModal'
import VatToggle from '@/components/ui/VatToggle'
import UnitToggle from '@/components/ui/UnitToggle'
import { withVat, withoutVat } from '@/lib/utils/vat'
import { Customer, CustomerLedgerDebt, CustomerLedgerPayment, RecurringItem, Direction, fmt, bal, waUrl } from './shared'

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentMethod = 'מזומן' | 'אשראי' | "צ'ק" | 'העברה'

interface InvoiceEntry {
  type: 'invoice' | 'karteset'
  number: string
  amount: string
  date: string
  direction: Direction
  notes: string
}

type Filter = 'open' | 'closed' | 'all'

interface CustomerTrackingTabProps {
  tenantId: string
  tenantName: string
  customers: Customer[]
  customerDebts: CustomerLedgerDebt[]
  customerPayments: CustomerLedgerPayment[]
  recurringItems: RecurringItem[]
  openId: string | null
  reload: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDMY = (d: string | Date) => {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
    if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`
    d = new Date(d)
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const monthISO = () => new Date().toISOString().slice(0, 7)
const EMPTY_INV = (): InvoiceEntry => ({ type: 'invoice', number: '', amount: '', date: todayISO(), direction: 'charge', notes: '' })
const paymentDateOf = (p: CustomerLedgerPayment) => p.payment_date ?? p.check_date ?? p.created_at.slice(0, 10)

const monthKeyOf = (iso: string) => iso.slice(0, 7)
const HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
const fmtMonth = (key: string) => { const [y, m] = key.split('-'); return `${HEB_MONTHS[parseInt(m) - 1]} ${y}` }

// ── Shared styles ─────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '11px',
  background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px',
}
const tdSt: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomerTrackingTab({
  tenantId, tenantName, customers, customerDebts, customerPayments, recurringItems, openId, reload,
}: CustomerTrackingTabProps) {
  const supabase    = useRef(createClient()).current
  const { showToast } = useToast()

  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')

  // Row selection

  // Manual merge of old customer_ledger_payments rows into one payment_group_id (for
  // payments recorded before migration 078 existed, so they also print as a single line)
  const [mergeCid, setMergeCid] = useState<string | null>(null)
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const toggleMergeSelected = (id: string) => setMergeSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const mergePayments = async () => {
    if (mergeSelected.size < 2) return
    const newGroupId = crypto.randomUUID()
    const { error } = await supabase.from('customer_ledger_payments')
      .update({ payment_group_id: newGroupId }).in('id', Array.from(mergeSelected))
    if (error) { showToast('שגיאה במיזוג: ' + error.message, 'error'); return }
    showToast('התשלומים מוזגו לשורה אחת ✓', 'success')
    setMergeCid(null); setMergeSelected(new Set())
    reload()
  }

  // Which customer cards are expanded (collapsed by default — click to open detail)
  const [openCustomerKeys, setOpenCustomerKeys] = useState<Set<string>>(new Set())
  const customerKeyOf = (cid: string | null) => cid ?? '__none__'
  const toggleCustomerOpen = (cid: string | null) => setOpenCustomerKeys(prev => {
    const k = customerKeyOf(cid)
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Which month blocks inside a customer card are expanded (collapsed by default; click a month to open just that one)
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<Set<string>>(new Set())
  const monthKeyFor = (cid: string | null, mk: string) => `${customerKeyOf(cid)}::${mk}`
  const toggleMonthCollapsed = (cid: string | null, mk: string) => setExpandedMonthKeys(prev => {
    const k = monthKeyFor(cid, mk)
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Customer debt form (each line = its own invoice/credit)
  const [showDebtModal, setShowDebtModal] = useState(false)
  const [editDebt, setEditDebt]           = useState<CustomerLedgerDebt | null>(null)
  const [dCustomer, setDCustomer] = useState('')
  const [dNotes, setDNotes]       = useState('')
  const [dInvoices, setDInvoices] = useState<InvoiceEntry[]>([EMPTY_INV()])
  const [dSaving, setDSaving]     = useState(false)

  // Payment modal — records one flat amount for a customer (2026-08-18 redesign: no more
  // per-invoice allocation). No check-series/calendar system for customers — a single "צ'ק"
  // payment just carries an optional check number/date inline.
  const [showPayModal, setShowPayModal]   = useState(false)
  const [payCustomerId, setPayCustomerId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  // Optional, purely cosmetic: which invoices this payment covers, for reference only —
  // sets is_closed=true on confirm, never affects any amount/balance.
  const [payTagIds, setPayTagIds] = useState<Set<string>>(new Set())
  const [payMethod, setPayMethod] = useState<PaymentMethod>('מזומן')
  const [payDate, setPayDate]     = useState(todayISO())
  const [payCheckNumber, setPayCheckNumber] = useState('')
  const [payCheckDate, setPayCheckDate]     = useState('')
  const [payRefNumber, setPayRefNumber]     = useState('')
  const [payReceiptIssued, setPayReceiptIssued] = useState(false)
  const [payReceiptNumber, setPayReceiptNumber] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  // Quick-add-customer modal
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)

  // Recurring-item (rate template) add/edit
  const [showRecItemModal, setShowRecItemModal] = useState(false)
  const [editRecItem, setEditRecItem] = useState<RecurringItem | null>(null)
  const [riCustomerId, setRiCustomerId] = useState<string | null>(null)
  const [riName, setRiName] = useState('')
  const [riType, setRiType] = useState<'fixed' | 'meter'>('fixed')
  const [riAmt, setRiAmt] = useState('')
  const [riPpu, setRiPpu] = useState('')
  const [riPpuUnit, setRiPpuUnit] = useState<'ils' | 'agorot'>('ils')
  const [riFixedAddon, setRiFixedAddon] = useState('')
  const [riFrom, setRiFrom] = useState(monthISO())
  const [riActive, setRiActive] = useState(true)
  const [riVat, setRiVat] = useState<'before' | 'after'>('after')
  const [riSaving, setRiSaving] = useState(false)

  // "Generate this month's charges" — fixed-type recurring items only
  const [genMonth, setGenMonth] = useState(monthISO())
  const [generating, setGenerating] = useState(false)

  // "Log a meter reading" — month-independent, one meter-type item at a time
  const [meterReadItem, setMeterReadItem] = useState<RecurringItem | null>(null)
  const [mrCurr, setMrCurr] = useState('')
  const [mrPeriodStart, setMrPeriodStart] = useState('')
  const [mrPeriodEnd, setMrPeriodEnd] = useState(todayISO())
  const [mrSaving, setMrSaving] = useState(false)

  const [waModal, setWaModal] = useState<{ phone: string; text: string } | null>(null)

  // Styled printing — pick what to print, then render a hidden print-only area
  const [showPrintChoice, setShowPrintChoice] = useState(false)
  const [printMode, setPrintMode] = useState<'ledger' | null>(null)
  const [printCustomerId, setPrintCustomerId] = useState<string>('')
  const [printRangeMode, setPrintRangeMode] = useState<'all' | 'months' | 'range'>('all')
  const [printMonths, setPrintMonths] = useState<Set<string>>(new Set())
  const [printDateFrom, setPrintDateFrom] = useState('')
  const [printDateTo, setPrintDateTo] = useState('')

  const printCustomerMonths = (() => {
    const set = new Set(customerDebts.filter(d => d.customer_id === printCustomerId).map(d => monthKeyOf(d.date)))
    return [...set].sort().reverse()
  })()
  const togglePrintMonth = (mk: string) => setPrintMonths(prev => {
    const next = new Set(prev)
    if (next.has(mk)) next.delete(mk); else next.add(mk)
    return next
  })

  useEffect(() => {
    if (!printMode) return
    const t = setTimeout(() => window.print(), 150)
    const onAfterPrint = () => { setPrintMode(null) }
    window.addEventListener('afterprint', onAfterPrint)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', onAfterPrint) }
  }, [printMode])

  // Deep-link: ?open=<customerId> (parsed once by the shell, passed down as `openId`)
  useEffect(() => {
    if (!openId) return
    const target = customers.find(c => c.id === openId)
    if (target) {
      setSearch(target.name)
      setOpenCustomerKeys(prev => new Set(prev).add(customerKeyOf(openId)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, customers.length])

  // ── Customer debt CRUD ────────────────────────────────────────────────────

  const openDebtModal = (d?: CustomerLedgerDebt) => {
    if (d) {
      setEditDebt(d); setDCustomer(d.customer_id ?? ''); setDNotes('')
      const existing = Array.isArray(d.invoices) && d.invoices.length > 0
        ? d.invoices.map(i => ({ type: i.type as 'invoice' | 'karteset', number: i.number, amount: String(i.amount), date: d.date, direction: d.direction, notes: d.description ?? '' }))
        : d.doc_number
          ? [{ type: (d.doc_type ?? 'invoice') as 'invoice' | 'karteset', number: d.doc_number, amount: String(d.amount), date: d.date, direction: d.direction, notes: d.description ?? '' }]
          : [{ ...EMPTY_INV(), date: d.date, direction: d.direction, notes: d.description ?? '' }]
      setDInvoices(existing)
    } else {
      setEditDebt(null); setDCustomer(''); setDNotes(''); setDInvoices([EMPTY_INV()])
    }
    setShowDebtModal(true)
  }

  const addInvoiceLine = () => setDInvoices(prev => [...prev, EMPTY_INV()])
  const removeInvoiceLine = (i: number) => setDInvoices(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  const updateInvoiceLine = (i: number, field: keyof InvoiceEntry, val: string) =>
    setDInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, [field]: val } : inv))

  const invoicesTotal = dInvoices.reduce((s, inv) => s + (inv.direction === 'credit' ? -1 : 1) * (parseFloat(inv.amount) || 0), 0)

  const saveDebt = async () => {
    const validLines = dInvoices.filter(i => i.number.trim() || parseFloat(i.amount) > 0)
    if (validLines.length === 0) { showToast('נא למלא לפחות שורה אחת', 'error'); return }
    if (validLines.some(l => !l.date)) { showToast('נא לבחור תאריך לכל שורה', 'error'); return }
    const tid = tenantId!
    setDSaving(true)

    if (editDebt) {
      // Editing an existing row (possibly a legacy multi-invoice bundle) — single-row update
      const invoicesData = validLines.map(i => ({ type: i.type, number: i.number.trim(), amount: parseFloat(i.amount) || 0 }))
      const total = invoicesData.reduce((s, i) => s + i.amount, 0)
      const row = {
        customer_id: dCustomer || null,
        amount: total || parseFloat(validLines[0]?.amount) || 0,
        description: validLines[0]?.notes.trim() || dNotes.trim() || null,
        date: validLines[0]?.date || todayISO(),
        doc_type: validLines[0]?.type ?? 'invoice',
        doc_number: validLines[0]?.number.trim() || null,
        direction: validLines[0]?.direction ?? 'charge',
        invoices: invoicesData,
      }
      const { error } = await supabase.from('customer_ledger_debts').update(row).eq('id', editDebt.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setDSaving(false); return }
      showToast('עודכן ✓', 'success')
    } else {
      // New entry — bulk insert one independent row per line, each its own date/direction
      const rows = validLines.map(l => ({
        id: crypto.randomUUID(), tenant_id: tid,
        customer_id: dCustomer || null,
        amount: parseFloat(l.amount) || 0,
        description: l.notes.trim() || dNotes.trim() || null,
        date: l.date,
        doc_type: l.type,
        doc_number: l.number.trim() || null,
        direction: l.direction,
        invoices: [],
        paid: 0,
        is_closed: l.direction === 'credit',
      }))
      const { error } = await supabase.from('customer_ledger_debts').insert(rows)
      if (error) { showToast('שגיאה בשמירה', 'error'); setDSaving(false); return }
      showToast(`נשמרו ${rows.length} רשומות ✓`, 'success')
    }
    setDSaving(false); setShowDebtModal(false); reload()
  }

  const deleteDebt = async (id: string) => {
    if (!confirm('למחוק רשומה זו?')) return
    await supabase.from('customer_ledger_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); reload()
  }

  const addDebtForCustomer = (custId: string) => {
    setEditDebt(null); setDCustomer(custId); setDNotes(''); setDInvoices([EMPTY_INV()])
    setShowDebtModal(true)
  }

  // ── Recurring items (rate templates: rent/arnona/electricity meter, etc.) ──

  const openRecItemModal = (customerId: string, item?: RecurringItem) => {
    setRiCustomerId(customerId)
    if (item) {
      setEditRecItem(item)
      setRiName(item.name); setRiType(item.type)
      setRiAmt(item.amount != null ? String(item.amount) : '')
      setRiPpu(item.price_per_unit != null ? String(item.price_per_unit) : '')
      setRiPpuUnit('ils')
      setRiFixedAddon(item.fixed_addon != null ? String(item.fixed_addon) : '')
      setRiFrom(item.valid_from); setRiActive(item.active); setRiVat('after')
    } else {
      setEditRecItem(null)
      setRiName(''); setRiType('fixed'); setRiAmt(''); setRiPpu(''); setRiPpuUnit('ils')
      setRiFixedAddon(''); setRiFrom(monthISO()); setRiActive(true); setRiVat('after')
    }
    setShowRecItemModal(true)
  }

  const saveRecItem = async () => {
    if (!riCustomerId) return
    if (!riName.trim()) { showToast('נא להזין שם', 'error'); return }
    const tid = tenantId
    if (!tid) return
    setRiSaving(true)
    const rawAmt = riType === 'fixed' ? (parseFloat(riAmt) || 0) : null
    const amount = rawAmt != null ? (riVat === 'before' ? withVat(rawAmt) : rawAmt) : null
    const rawPpu = riType === 'meter' ? (parseFloat(riPpu) || 0) : null
    const ppuIls = rawPpu != null ? (riPpuUnit === 'agorot' ? rawPpu / 100 : rawPpu) : null
    const price_per_unit = ppuIls != null ? (riVat === 'before' ? withVat(ppuIls) : ppuIls) : null
    const row = {
      tenant_id: tid, name: riName.trim(), customer_id: riCustomerId, supplier_id: null,
      type: riType, amount, price_per_unit,
      fixed_addon: riType === 'meter' && riFixedAddon ? (parseFloat(riFixedAddon) || 0) : null,
      valid_from: riFrom, active: riActive,
    }
    const { error } = editRecItem
      ? await supabase.from('recurring_items').update(row).eq('id', editRecItem.id)
      : await supabase.from('recurring_items').insert(row)
    if (error) { showToast('שגיאה בשמירה: ' + error.message, 'error'); setRiSaving(false); return }
    showToast('נשמר ✓', 'success')
    setRiSaving(false); setShowRecItemModal(false); reload()
  }

  const deleteRecItem = async (id: string) => {
    if (!confirm('למחוק חיוב חוזר זה?')) return
    await supabase.from('recurring_items').delete().eq('id', id)
    showToast('נמחק', 'success'); reload()
  }

  // ── Generate this month's charges — fixed-type recurring items only ───────
  // Meter-type items are deliberately excluded here (see "log a meter reading" below):
  // meter readings aren't taken every calendar month, so auto-generating a monthly
  // placeholder for them would nag the user in months they haven't actually read the meter.

  const generateRecurringCharges = async () => {
    const tid = tenantId
    if (!tid) return
    setGenerating(true)
    try {
      const active = recurringItems.filter(it => it.type === 'fixed' && it.active && it.valid_from <= genMonth)
      const best = new Map<string, RecurringItem>()
      for (const it of active) {
        const key = `${it.customer_id ?? ''}__${it.name}`
        const prev = best.get(key)
        if (!prev || it.valid_from > prev.valid_from) best.set(key, it)
      }
      const monthStart = `${genMonth}-01`
      const [y, m] = genMonth.split('-').map(Number)
      const nextMonthStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      const existingRecIds = new Set(
        customerDebts.filter(d => d.recurring_item_id && d.date >= monthStart && d.date < nextMonthStart)
          .map(d => d.recurring_item_id)
      )
      const toCreate = [...best.values()].filter(it => !existingRecIds.has(it.id))
      if (!toCreate.length) { showToast('כל החיובים הקבועים כבר נוצרו לחודש זה', 'error'); setGenerating(false); return }
      const rows = toCreate.map(it => ({
        tenant_id: tid, customer_id: it.customer_id, amount: it.amount ?? 0,
        paid: 0, description: it.name, date: monthStart, is_closed: false,
        doc_type: 'invoice', direction: 'charge' as const, invoices: [],
        recurring_item_id: it.id,
      }))
      const { error } = await supabase.from('customer_ledger_debts').insert(rows)
      if (error) throw error
      showToast(`נוצרו ${rows.length} חיובים ✓`, 'success')
      reload()
    } catch { showToast('שגיאה ביצירת חיובים', 'error') }
    setGenerating(false)
  }

  // ── Log a meter reading — month-independent, one meter-type item at a time ─

  const addDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(y, m - 1, d + 1)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  const lastMeterRow = (itemId: string) => {
    const rows = customerDebts.filter(d => d.recurring_item_id === itemId && d.meter_curr != null)
      .sort((a, b) => (a.period_end ?? a.date).localeCompare(b.period_end ?? b.date))
    return rows[rows.length - 1]
  }

  const meterPrevReading = meterReadItem ? Number(lastMeterRow(meterReadItem.id)?.meter_curr ?? 0) : 0
  const mrComputedTotal = meterReadItem
    ? ((parseFloat(mrCurr) || 0) - meterPrevReading) * (meterReadItem.price_per_unit ?? 0) + (meterReadItem.fixed_addon ?? 0)
    : 0

  const openMeterReadModal = (item: RecurringItem) => {
    const last = lastMeterRow(item.id)
    setMeterReadItem(item)
    setMrCurr('')
    setMrPeriodStart(last?.period_end ? addDay(last.period_end) : '')
    setMrPeriodEnd(todayISO())
  }

  const saveMeterReading = async () => {
    if (!meterReadItem) return
    const tid = tenantId
    if (!tid) return
    const curr = parseFloat(mrCurr)
    if (isNaN(curr)) { showToast('נא להזין קריאה נוכחית', 'error'); return }
    if (!mrPeriodStart) { showToast('נא לבחור תאריך תחילת תקופה', 'error'); return }
    setMrSaving(true)
    const { error } = await supabase.from('customer_ledger_debts').insert({
      tenant_id: tid, customer_id: meterReadItem.customer_id,
      amount: mrComputedTotal, paid: 0, description: meterReadItem.name, date: mrPeriodEnd,
      is_closed: false, doc_type: 'invoice', direction: 'charge', invoices: [],
      recurring_item_id: meterReadItem.id,
      meter_prev: meterPrevReading, meter_curr: curr,
      price_per_unit: meterReadItem.price_per_unit, fixed_addon: meterReadItem.fixed_addon,
      period_start: mrPeriodStart, period_end: mrPeriodEnd,
    })
    if (error) { showToast('שגיאה בשמירה: ' + error.message, 'error'); setMrSaving(false); return }
    showToast('קריאה נשמרה ✓', 'success')
    setMrSaving(false); setMeterReadItem(null); reload()
  }

  // ── Payment (one flat amount for a customer — no invoice allocation) ───────

  // Charge invoices not yet manually tagged "🏷 מכוסה" — purely a reference list the user can
  // optionally check off after recording a payment, never used to compute any amount.
  const payUntaggedDebts = customerDebts.filter(d => d.customer_id === payCustomerId && !d.is_closed && d.direction === 'charge')
  const payDebtsByMonth = (() => {
    const map: Record<string, CustomerLedgerDebt[]> = {}
    payUntaggedDebts.forEach(d => {
      const mk = monthKeyOf(d.date)
      if (!map[mk]) map[mk] = []
      map[mk].push(d)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  const openPayCustomer = (customerId: string | null, preselectId?: string) => {
    setPayCustomerId(customerId)
    setPayAmount('')
    setPayMethod('מזומן'); setPayDate(todayISO()); setPayCheckNumber(''); setPayCheckDate(todayISO())
    setPayRefNumber('')
    setPayReceiptIssued(false); setPayReceiptNumber('')
    setPayTagIds(preselectId ? new Set([preselectId]) : new Set())
    setShowPayModal(true)
  }

  const togglePayTag = (id: string) => {
    setPayTagIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleMonthPayTags = (mk: string) => {
    const monthDebts = payDebtsByMonth.find(([k]) => k === mk)?.[1] ?? []
    const allSelected = monthDebts.length > 0 && monthDebts.every(d => payTagIds.has(d.id))
    setPayTagIds(prev => {
      const next = new Set(prev)
      monthDebts.forEach(d => { if (allSelected) next.delete(d.id); else next.add(d.id) })
      return next
    })
  }

  const submitPayment = async () => {
    const amount = parseFloat(payAmount) || 0
    if (amount <= 0) { showToast('סכום לא תקין', 'error'); return }
    const tid = tenantId
    if (!tid || !payCustomerId) return

    const refNumber = payMethod === "צ'ק" ? payCheckNumber : payMethod === 'העברה' ? payRefNumber : ''

    setPaySaving(true)
    const { error } = await recordCustomerPayment(supabase, tid, payCustomerId, amount, {
      payment_method: payMethod,
      check_number: refNumber || null,
      check_date: payMethod === "צ'ק" ? (payCheckDate || null) : null,
      notes: null,
      payment_date: payDate,
      receipt_issued: payReceiptIssued,
      receipt_number: payReceiptIssued ? (payReceiptNumber.trim() || null) : null,
    })
    if (error) { showToast('שגיאה בתשלום: ' + error, 'error'); setPaySaving(false); return }

    if (payTagIds.size > 0) {
      await supabase.from('customer_ledger_debts').update({ is_closed: true }).in('id', Array.from(payTagIds))
    }

    const custName = customers.find(c => c.id === payCustomerId)?.name ?? 'לקוח'
    await supabase.from('income').insert({
      tenant_id: tid, date: payDate, category: 'לקוחות',
      description: `תשלום מלקוח ${custName}`, amount,
      customer_id: payCustomerId, payment_method: payMethod,
      payment_ref: refNumber || null,
    })

    showToast('תשלום נרשם ✓', 'success')
    setPaySaving(false); setShowPayModal(false); reload()
  }

  // Purely cosmetic "🏷 מכוסה" tag — never affects any amount/balance (see lib/debts/ledger.ts).
  const toggleClose = async (id: string, current: boolean) => {
    await supabase.from('customer_ledger_debts').update({ is_closed: !current }).eq('id', id)
    reload()
  }

  // Deleting a payment under the simplified model needs no reversal anywhere — the balance is
  // always recomputed fresh from raw amounts (balanceOf), never stored per-invoice. `ids` covers
  // every raw row behind one displayed line (a merged/grouped payment is deleted as a whole).
  const deletePayments = async (ids: string[]) => {
    if (!confirm(ids.length > 1 ? `למחוק תשלום זה (${ids.length} רשומות מוזגו)?` : 'למחוק תשלום זה?')) return
    await supabase.from('customer_ledger_payments').delete().in('id', ids)
    showToast('נמחק', 'success'); reload()
  }

  // For starting a customer's payment history over from scratch — deletes every payment ever
  // recorded for them (not the invoices/credits themselves). Confirms by typing the customer's
  // name, since this is bulk and irreversible.
  const deleteAllPaymentsForCustomer = async (custId: string, custName: string, count: number) => {
    const typed = prompt(`פעולה זו תמחק את כל ${count} התשלומים של ${custName} לצמיתות (לא את החשבוניות עצמן).\nלאישור, הקלד את שם הלקוח: ${custName}`)
    if (typed !== custName) { if (typed !== null) showToast('השם לא תואם — בוטל', 'error'); return }
    await supabase.from('customer_ledger_payments').delete().eq('customer_id', custId)
    showToast('כל התשלומים נמחקו ✓', 'success'); reload()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  const openCustTotal = balanceOf(customerDebts, customerPayments)

  // ── Selected item info ────────────────────────────────────────────────────


  // ── Sub-components ────────────────────────────────────────────────────────

  const FilterBtn = ({ f, label }: { f: Filter; label: string }) => (
    <button onClick={() => setFilter(f)} style={{
      padding: '5px 14px', border: '1px solid',
      borderColor: filter === f ? 'var(--primary)' : 'var(--border)',
      background: filter === f ? '#f0fdf6' : 'transparent',
      color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
      borderRadius: '20px', fontSize: '12px', fontWeight: filter === f ? 600 : 400,
      cursor: 'pointer', transition: 'all .12s',
    }}>{label}</button>
  )

  // No more per-invoice paid/partial status — "🏷 מכוסה" is a manual, cosmetic reference tag
  // only (kept out of the green/"paid" color family on purpose, see lib/debts/ledger.ts).
  const StatusChip = ({ debt }: { debt: CustomerLedgerDebt }) => {
    if (debt.direction === 'credit')
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>זיכוי</span>
    if (debt.is_closed)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }}>🏷 מכוסה</span>
    return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>חיוב</span>
  }

  const EmptyState = ({ icon, text }: { icon: string; text: string }) => (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '52px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '14px' }}>{text}</div>
    </div>
  )

  // ── Excel ─────────────────────────────────────────────────────────────────

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const rows = customerDebts.map(d => ({
      לקוח: customers.find(c => c.id === d.customer_id)?.name ?? '', מספר: d.doc_number ?? '',
      סוג: d.direction === 'credit' ? 'זיכוי' : 'חיוב', סכום: d.amount,
      תאריך: d.date, מכוסה: d.is_closed ? 'כן' : 'לא', תיאור: d.description ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חשבוניות וזיכויים')

    const paymentRows = customerPayments.map(p => ({
      לקוח: customers.find(c => c.id === p.customer_id)?.name ?? '',
      סכום: p.amount, תאריך: p.payment_date ?? p.check_date ?? p.created_at.slice(0, 10),
      אמצעי: p.payment_method, קבלה: p.receipt_issued ? (p.receipt_number || 'כן') : '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), 'תשלומים')

    XLSX.writeFile(wb, 'מעקב-לקוחות.xlsx')
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const tid = tenantId
    if (!tid) return
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    if (!rows.length) { showToast('הקובץ ריק', 'error'); return }

    const parseDate = (v: unknown): string => {
      if (v instanceof Date) return v.toISOString().slice(0, 10)
      if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
      const s = String(v ?? '').trim()
      const m = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/)
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      return todayISO()
    }

    const toInsert = rows.map(r => {
      const custName = String(r['לקוח'] ?? '').trim()
      const customer = custName ? customers.find(c => c.name === custName) : undefined
      const direction: Direction = String(r['סוג'] ?? '').includes('זיכוי') ? 'credit' : 'charge'
      const amount = parseFloat(String(r['סכום'] ?? '')) || 0
      // is_closed is just the optional cosmetic "🏷 מכוסה" tag — no paid/balance math here.
      const isClosed = direction === 'credit' || String(r['מכוסה'] ?? r['סטטוס'] ?? '').trim() === 'כן' || String(r['סטטוס'] ?? '').includes('סגור')
      return {
        id: crypto.randomUUID(), tenant_id: tid,
        customer_id: customer?.id ?? null,
        amount, paid: 0, direction, is_closed: isClosed,
        date: parseDate(r['תאריך']),
        doc_type: 'invoice', doc_number: String(r['מספר'] ?? '').trim() || null,
        description: String(r['תיאור'] ?? '').trim() || null,
        invoices: [],
      }
    }).filter(r => r.amount > 0)

    if (!toInsert.length) { showToast('לא נמצאו שורות תקינות (חסר סכום)', 'error'); return }
    const { error } = await supabase.from('customer_ledger_debts').insert(toInsert)
    if (error) { showToast('שגיאה בייבוא: ' + error.message, 'error'); return }
    showToast(`יובאו ${toInsert.length} רשומות ✓`, 'success')
    reload()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => openDebtModal()}>+ הוסף חשבונית/זיכוי</Button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)} className="form-input" style={{ margin: 0, padding: '7px 8px', fontSize: '12px' }} />
            <Button variant="secondary" loading={generating} onClick={generateRecurringCharges}>🔄 צור חיובים לחודש</Button>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <FilterBtn f="open" label="פתוחים" />
            <FilterBtn f="closed" label="סגורים" />
            <FilterBtn f="all" label="הכל" />
          </div>
          <input
            placeholder="חיפוש לקוח / תיאור..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
          />
          <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
            יתרה כוללת: <strong style={{ color: 'var(--danger)' }}>{fmt(openCustTotal)}</strong>
          </span>
          <Button variant="secondary" onClick={() => setShowPrintChoice(true)}>🖨️ הדפסה</Button>
          <ExcelMenu onExportExcel={exportExcel} onImportExcel={importExcel} />
        </div>

        {(() => {
          const allCustIds = [...new Set(customerDebts.map(d => d.customer_id))]
          const groups = allCustIds.map(cid => {
            const debts = customerDebts.filter(d => d.customer_id === cid)
            const payments = customerPayments.filter(p => p.customer_id === cid)
            const cust = customers.find(c => c.id === cid)
            const totalBal = balanceOf(debts, payments)

            if (search.trim()) {
              const q = search.toLowerCase()
              const nameMatch = (cust?.name ?? '').toLowerCase().includes(q)
              const descMatch = debts.some(d => d.description?.toLowerCase().includes(q))
              if (!nameMatch && !descMatch) return null
            }
            if (filter === 'open'   && totalBal === 0) return null
            if (filter === 'closed' && totalBal > 0)  return null

            const monthMap: Record<string, CustomerLedgerDebt[]> = {}
            debts.forEach(d => {
              const mk = monthKeyOf(d.date)
              if (!monthMap[mk]) monthMap[mk] = []
              monthMap[mk].push(d)
            })
            // A payment recorded in a month with no invoice of its own still needs a month
            // block to render under — otherwise it's counted correctly in totalBal (below)
            // but has nowhere on screen to show up, and looks like it silently vanished.
            payments.forEach(p => {
              const mk = monthKeyOf(paymentDateOf(p))
              if (!monthMap[mk]) monthMap[mk] = []
            })
            const months = Object.keys(monthMap).sort().reverse()

            return { cid, cust, totalBal, payments, monthMap, months }
          }).filter(Boolean) as {
            cid: string | null; cust: Customer | undefined; totalBal: number; payments: CustomerLedgerPayment[]
            monthMap: Record<string, CustomerLedgerDebt[]>; months: string[]
          }[]

          if (groups.length === 0) return (
            <EmptyState icon="💳" text={`אין רשומות ${filter === 'open' ? 'פתוחות' : filter === 'closed' ? 'סגורות' : ''}`} />
          )

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {groups.map(group => {
                const isOpen = openCustomerKeys.has(customerKeyOf(group.cid))
                return (
                <div key={group.cid ?? 'none'} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

                  <div
                    onClick={() => toggleCustomerOpen(group.cid)}
                    style={{ background: '#f1f5f9', borderBottom: isOpen ? '2px solid var(--border)' : 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--text-muted)' }}>›</span>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>💳 {group.cust?.name ?? 'ללא לקוח'}</span>
                    {group.cust?.phone && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{group.cust.phone}</span>}
                    <span style={{ marginRight: 'auto', fontSize: '14px', fontWeight: 700, color: group.totalBal > 0 ? 'var(--danger)' : '#16a34a' }}>
                      יתרה כוללת: {fmt(group.totalBal)}
                    </span>
                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px' }}>
                      {group.totalBal > 0 && (
                        <button onClick={() => openPayCustomer(group.cid)}
                          style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          💰 תשלום
                        </button>
                      )}
                      {group.cid && (
                        <button onClick={() => addDebtForCustomer(group.cid!)}
                          style={{ padding: '4px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          + הוסף
                        </button>
                      )}
                      {group.cid && group.payments.length > 0 && (
                        <button
                          onClick={() => deleteAllPaymentsForCustomer(group.cid!, group.cust?.name ?? '', group.payments.length)}
                          title="מחיקת כל התשלומים של הלקוח, כדי להתחיל תיעוד תשלומים מחדש (לא נוגע בחשבוניות)"
                          style={{ padding: '4px 12px', background: 'transparent', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          🗑 מחק כל התשלומים
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                  <>

                  {group.cid && group.payments.length > 1 && (
                    <div style={{ background: mergeCid === group.cid ? '#f5f3ff' : undefined, borderBottom: '1px solid var(--border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {mergeCid === group.cid ? (
                        <>
                          <span style={{ fontSize: '12px', color: '#5b21b6' }}>סמן 2+ שורות תשלום למיזוג לשורה אחת בהדפסה (נבחרו: {mergeSelected.size})</span>
                          <Button size="sm" onClick={mergePayments} disabled={mergeSelected.size < 2}>🔗 מזג</Button>
                          <Button size="sm" variant="secondary" onClick={() => { setMergeCid(null); setMergeSelected(new Set()) }}>ביטול</Button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setMergeCid(group.cid); setMergeSelected(new Set()) }}
                          title="מזג כמה שורות תשלום ישנות (מלפני שהמערכת שמרה קיבוץ) לשורה אחת בהדפסה"
                          style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, background: 'transparent', color: '#7c3aed', border: '1px solid #7c3aed' }}>
                          🔗 מזג תשלומים
                        </button>
                      )}
                    </div>
                  )}

                  {group.cid && (() => {
                    const items = recurringItems.filter(it => it.customer_id === group.cid)
                    return (
                      <div style={{ background: '#fafaf9', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: items.length ? '8px' : 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>🔁 חיובים חוזרים</span>
                          <button onClick={() => openRecItemModal(group.cid!)} style={{ padding: '3px 10px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>+ הוסף חיוב חוזר</button>
                        </div>
                        {items.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {items.map(it => (
                              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', flexWrap: 'wrap' }}>
                                <span style={{ padding: '1px 7px', borderRadius: '4px', fontWeight: 600, background: it.type === 'meter' ? '#eff6ff' : '#f0fdf6', color: it.type === 'meter' ? '#1d4ed8' : '#16a34a' }}>
                                  {it.type === 'meter' ? 'מונה' : 'קבוע'}
                                </span>
                                <span style={{ fontWeight: 600, flex: 1, minWidth: '80px' }}>{it.name}</span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {it.type === 'meter' ? `${fmt(it.price_per_unit ?? 0)} ליחידה` : fmt(it.amount ?? 0)}
                                </span>
                                {!it.active && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(לא פעיל)</span>}
                                {it.type === 'meter' && it.active && (
                                  <button onClick={() => openMeterReadModal(it)} style={{ padding: '3px 9px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>📊 הזן קריאת מונה</button>
                                )}
                                <button onClick={() => openRecItemModal(group.cid!, it)} style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                                <button onClick={() => deleteRecItem(it.id)} style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px' }}>🗑</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {group.months.map((mk, mIdx) => {
                    const monthDebts = group.monthMap[mk]
                    // Each month shows its own charges-minus-credits — payments aren't tied to a
                    // month, they simply reduce the customer's overall balance shown up top.
                    const monthChargeTotal = monthDebts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
                    const monthCreditTotal = monthDebts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
                    const monthNetTotal    = monthChargeTotal - monthCreditTotal
                    const monthPayments    = group.payments.filter(p => monthKeyOf(paymentDateOf(p)) === mk)
                    const monthPaidTotal   = monthPayments.reduce((s, p) => s + Number(p.amount), 0)
                    const monthCollapsed   = !expandedMonthKeys.has(monthKeyFor(group.cid, mk))

                    return (
                      <div key={mk} style={{ borderBottom: mIdx < group.months.length - 1 ? '1px solid var(--border)' : 'none', padding: '14px 16px' }}>

                        <div
                          onClick={() => toggleMonthCollapsed(group.cid, mk)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: monthCollapsed ? 0 : '10px', cursor: 'pointer' }}
                        >
                          <span style={{ display: 'inline-block', transition: 'transform .15s', transform: monthCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', color: 'var(--text-muted)', fontSize: '12px' }}>›</span>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                          <span style={{ marginRight: 'auto', fontSize: '13px', fontWeight: 700, color: monthNetTotal > 0 ? 'var(--danger)' : '#16a34a' }}>
                            נטו לחודש: {fmt(monthNetTotal)}
                          </span>
                        </div>

                        {/* Invoices/credits table */}
                        {!monthCollapsed && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={thSt}>מספר חשבונית</th>
                              <th style={thSt}>תאריך</th>
                              <th style={thSt}>סוג</th>
                              <th style={{ ...thSt, textAlign: 'left' }}>סכום</th>
                              <th style={{ ...thSt, textAlign: 'center', width: '70px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const debtRows = monthDebts.flatMap(d => {
                                const items = Array.isArray(d.invoices) && d.invoices.length > 0
                                  ? d.invoices
                                  : [{ type: d.doc_type ?? 'invoice', number: d.doc_number ?? '', amount: Number(d.amount) }]
                                return items.map((item, idx) => ({ kind: 'debt' as const, date: d.date, node: (
                                  <tr
                                    key={`${d.id}-${idx}`}
                                    className="tr-hover"
                                    style={{ background: d.is_closed && d.direction === 'charge' ? '#fafafa' : undefined }}
                                  >
                                    <td style={tdSt}>
                                      {item.number ? `#${item.number}` : '—'}
                                      {d.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{d.description}</div>}
                                    </td>
                                    <td style={{ ...tdSt, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.date}</td>
                                    <td style={tdSt}><StatusChip debt={d} /></td>
                                    <td style={{ ...tdSt, textAlign: 'left', fontWeight: 700, color: d.direction === 'credit' ? '#16a34a' : 'var(--danger)' }}>
                                      {d.direction === 'credit' ? '−' : ''}{fmt(item.amount)}
                                    </td>
                                    <td style={{ ...tdSt, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      <RowActionsMenu actions={[
                                        ...(customers.find(c => c.id === d.customer_id)?.phone ? [{
                                          key: 'wa', label: 'ווצאפ', icon: '💬', onClick: () => {
                                            const cust = customers.find(c => c.id === d.customer_id)!
                                            setWaModal({ phone: cust.phone!, text: `שלום ${cust.name}, ברצוני לבדוק חוב בסך ${fmt(balanceOf(customerDebts.filter(x => x.customer_id === cust.id), customerPayments.filter(p => p.customer_id === cust.id)))}.\nתודה!\n${tenantName}` })
                                          },
                                        }] : []),
                                        ...(!d.is_closed && d.direction === 'charge' ? [
                                          { key: 'pay', label: 'שלם', icon: '₪', onClick: () => openPayCustomer(d.customer_id, d.id) },
                                        ] : []),
                                        { key: 'tag', label: d.is_closed ? 'בטל תיוג' : 'תייג כמכוסה', icon: d.is_closed ? '↩' : '🏷', onClick: () => toggleClose(d.id, d.is_closed) },
                                        { key: 'edit', label: 'ערוך', icon: '✏️', onClick: () => openDebtModal(d) },
                                        { key: 'delete', label: 'מחק', icon: '🗑', danger: true, onClick: () => deleteDebt(d.id) },
                                      ]} />
                                    </td>
                                  </tr>
                                ) }))
                              })
                              const merging = mergeCid === group.cid
                              // While actively picking rows to merge, show every raw row so each
                              // can be selected individually. Otherwise, collapse rows that already
                              // share a payment_group_id (via the merge tool, or new same-submission
                              // payments) into one displayed line — matches the print grouping, so
                              // "merge" visibly does something here instead of only in print.
                              const paymentRows = (merging ? monthPayments.map(p => [p]) : (() => {
                                const byGroup = new Map<string, CustomerLedgerPayment[]>()
                                monthPayments.forEach(p => {
                                  const key = p.payment_group_id ?? p.id
                                  const arr = byGroup.get(key)
                                  if (arr) arr.push(p); else byGroup.set(key, [p])
                                })
                                return Array.from(byGroup.values())
                              })())
                                .map(rowGroup => {
                                  const p = rowGroup[0]
                                  const total = rowGroup.reduce((s, g) => s + Number(g.amount), 0)
                                  const selected = rowGroup.every(g => mergeSelected.has(g.id))
                                  const toggleGroup = () => rowGroup.forEach(g => toggleMergeSelected(g.id))
                                  return { kind: 'payment' as const, date: paymentDateOf(p), node: (
                                  <tr
                                    key={`pay-${p.id}`}
                                    onClick={merging ? toggleGroup : undefined}
                                    style={{ background: selected ? '#ddd6fe' : '#f0fdf6', cursor: merging ? 'pointer' : undefined }}
                                  >
                                    <td style={tdSt}>
                                      {merging && <input type="checkbox" checked={selected} onChange={toggleGroup} style={{ marginLeft: '6px' }} />}
                                      {p.receipt_issued ? `🧾 קבלה #${p.receipt_number || '—'}` : '💰 תשלום'}
                                    </td>
                                    <td style={{ ...tdSt, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{paymentDateOf(p)}</td>
                                    <td style={tdSt}><span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>{p.payment_method}</span></td>
                                    <td style={{ ...tdSt, textAlign: 'left', fontWeight: 700, color: '#16a34a' }}>−{fmt(total)}</td>
                                    <td style={{ ...tdSt, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                      {!merging && (
                                        <button
                                          onClick={e => { e.stopPropagation(); deletePayments(rowGroup.map(g => g.id)) }}
                                          title="מחק תשלום"
                                          style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                        >🗑</button>
                                      )}
                                    </td>
                                  </tr>
                                ) } })
                              return [...debtRows, ...paymentRows].sort((a, b) => a.date.localeCompare(b.date)).map(r => r.node)
                            })()}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                              <td colSpan={5} style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                                  <span>סה&quot;כ חיוב: <strong style={{ color: 'var(--text)' }}>{fmt(monthChargeTotal)}</strong></span>
                                  {monthCreditTotal > 0 && <span>סה&quot;כ זיכוי: <strong style={{ color: 'var(--danger)' }}>{fmt(monthCreditTotal)}</strong></span>}
                                  <span>נטו: <strong style={{ color: 'var(--text)' }}>{fmt(monthNetTotal)}</strong></span>
                                  {monthPaidTotal > 0 && <span>שולם בחודש זה: <strong style={{ color: '#16a34a' }}>{fmt(monthPaidTotal)}</strong></span>}
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        )}
                      </div>
                    )
                  })}

                  </>
                  )}
                </div>
              )})}
            </div>
          )
        })()}
      </div>

      {/* ── RECURRING ITEM (RATE TEMPLATE) MODAL ── */}
      {showRecItemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowRecItemModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editRecItem ? '✏️ עריכת חיוב חוזר' : '+ חיוב חוזר חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                שם (למשל: שכירות, ארנונה, חשמל)
                <input value={riName} onChange={e => setRiName(e.target.value)} className="form-input" />
              </label>

              <div style={{ display: 'flex', gap: '6px' }}>
                {(['fixed', 'meter'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setRiType(t)} style={{
                    flex: 1, padding: '7px', border: '1px solid', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                    borderColor: riType === t ? 'var(--primary)' : 'var(--border)',
                    background: riType === t ? 'var(--primary)' : 'transparent',
                    color: riType === t ? '#fff' : 'var(--text-muted)',
                  }}>{t === 'fixed' ? 'סכום קבוע' : 'לפי מונה'}</button>
                ))}
              </div>

              {riType === 'fixed' ? (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>סכום חודשי</span>
                    <VatToggle mode={riVat} onChange={setRiVat} />
                  </div>
                  <input type="number" min="0" step="0.01" value={riAmt} onChange={e => setRiAmt(e.target.value)} className="form-input" style={{ margin: 0 }} />
                  {riAmt && parseFloat(riAmt) > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {riVat === 'after'
                        ? `לפני מע"מ: ${fmt(withoutVat(parseFloat(riAmt)))}`
                        : `כולל מע"מ (18%): ${fmt(withVat(parseFloat(riAmt)))}`}
                    </div>
                  )}
                </label>
              ) : (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>מחיר ליחידה</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <UnitToggle unit={riPpuUnit} onChange={setRiPpuUnit} />
                        <VatToggle mode={riVat} onChange={setRiVat} />
                      </div>
                    </div>
                    <input type="number" min="0" step="0.0001" value={riPpu} onChange={e => setRiPpu(e.target.value)} className="form-input" style={{ margin: 0 }} />
                    {riPpu && parseFloat(riPpu) > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {riVat === 'after'
                          ? `לפני מע"מ: ₪${withoutVat(parseFloat(riPpu) / (riPpuUnit === 'agorot' ? 100 : 1)).toFixed(4)}`
                          : `כולל מע"מ: ₪${withVat(parseFloat(riPpu) / (riPpuUnit === 'agorot' ? 100 : 1)).toFixed(4)}`}
                      </div>
                    )}
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                    תוספת קבועה (אופציונלי — למשל דמי תשתית)
                    <input type="number" min="0" step="0.01" value={riFixedAddon} onChange={e => setRiFixedAddon(e.target.value)} className="form-input" style={{ margin: 0 }} />
                  </label>
                </>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                בתוקף מחודש
                <input type="month" value={riFrom} onChange={e => setRiFrom(e.target.value)} className="form-input" />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={riActive} onChange={e => setRiActive(e.target.checked)} />
                פעיל
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowRecItemModal(false)}>ביטול</Button>
              <Button loading={riSaving} onClick={saveRecItem}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG A METER READING MODAL (month-independent) ── */}
      {meterReadItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setMeterReadItem(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '440px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>📊 הזן קריאת מונה — {meterReadItem.name}</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>קריאה קודמת: <strong>{meterPrevReading}</strong></div>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                קריאה נוכחית
                <input type="number" step="0.01" value={mrCurr} onChange={e => setMrCurr(e.target.value)} className="form-input" style={{ margin: 0 }} autoFocus />
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  תחילת תקופה
                  <input type="date" value={mrPeriodStart} onChange={e => setMrPeriodStart(e.target.value)} className="form-input" style={{ margin: 0 }} />
                </label>
                <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                  תאריך קריאה
                  <input type="date" value={mrPeriodEnd} onChange={e => setMrPeriodEnd(e.target.value)} className="form-input" style={{ margin: 0 }} />
                </label>
              </div>
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', fontWeight: 700 }}>
                סה&quot;כ לחיוב: {fmt(mrComputedTotal)}
              </div>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setMeterReadItem(null)}>ביטול</Button>
              <Button loading={mrSaving} onClick={saveMeterReading}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOMER DEBT MODAL ── */}
      {showDebtModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDebtModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '620px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editDebt ? '✏️ עריכת רשומה' : '+ חשבונית/זיכוי חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>לקוח</span>
                  <button type="button" onClick={() => setShowQuickAddCustomer(true)} style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>+ הוסף לקוח חדש</button>
                </div>
                <select value={dCustomer} onChange={e => setDCustomer(e.target.value)} className="form-input">
                  <option value="">— ללא לקוח ספציפי —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>חשבוניות / זיכויים</span>
                  {!editDebt && (
                    <button type="button" onClick={addInvoiceLine} style={{ padding: '4px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>+ הוסף שורה</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dInvoices.map((inv, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['invoice', 'karteset'] as const).map(t => (
                            <button key={t} type="button" onClick={() => updateInvoiceLine(i, 'type', t)} style={{
                              padding: '4px 8px', border: '1px solid', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                              borderColor: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--border)',
                              background: inv.type === t ? (t === 'karteset' ? '#ede9fe' : '#e0f2fe') : 'transparent',
                              color: inv.type === t ? (t === 'karteset' ? '#7c3aed' : '#0369a1') : 'var(--text-muted)',
                            }}>{t === 'invoice' ? 'חשבונית' : 'כרטסת'}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['charge', 'credit'] as const).map(dir => (
                            <button key={dir} type="button" onClick={() => updateInvoiceLine(i, 'direction', dir)} style={{
                              padding: '4px 10px', border: '1px solid', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 600,
                              borderColor: inv.direction === dir ? (dir === 'credit' ? '#16a34a' : 'var(--danger)') : 'var(--border)',
                              background: inv.direction === dir ? (dir === 'credit' ? '#f0fdf6' : '#fef2f2') : 'transparent',
                              color: inv.direction === dir ? (dir === 'credit' ? '#16a34a' : 'var(--danger)') : 'var(--text-muted)',
                            }}>{dir === 'charge' ? 'חיוב' : 'זיכוי'}</button>
                          ))}
                        </div>
                        {!editDebt && (
                          <button type="button" onClick={() => removeInvoiceLine(i)} disabled={dInvoices.length === 1}
                            style={{ padding: '4px 8px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: dInvoices.length === 1 ? 'default' : 'pointer', opacity: dInvoices.length === 1 ? 0.4 : 1 }}
                          >✕</button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <input value={inv.number} onChange={e => updateInvoiceLine(i, 'number', e.target.value)} placeholder="מספר חשבונית..." className="form-input" style={{ margin: 0 }} />
                        <input type="number" min="0" step="0.01" value={inv.amount} onChange={e => updateInvoiceLine(i, 'amount', e.target.value)} placeholder="סכום..." className="form-input" style={{ margin: 0 }} />
                        <input type="date" value={inv.date} onChange={e => updateInvoiceLine(i, 'date', e.target.value)} className="form-input" style={{ margin: 0 }} />
                      </div>
                      <input value={inv.notes} onChange={e => updateInvoiceLine(i, 'notes', e.target.value)} placeholder="הערות לשורה זו (אופציונלי)..." className="form-input" style={{ margin: 0 }} />
                    </div>
                  ))}
                </div>
                {invoicesTotal !== 0 && (
                  <div style={{ textAlign: 'left', marginTop: '8px', fontSize: '14px', fontWeight: 700, color: invoicesTotal < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                    סה&quot;כ נטו: {fmt(invoicesTotal)}
                  </div>
                )}
                {!editDebt && dInvoices.length > 1 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>כל שורה תישמר כרשומה עצמאית משלה, עם התאריך והסוג שבחרת.</div>
                )}
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                הערות (אופציונלי)
                <input value={dNotes} onChange={e => setDNotes(e.target.value)} placeholder="פירוט נוסף..." className="form-input" />
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowDebtModal(false)}>ביטול</Button>
              <Button loading={dSaving} onClick={saveDebt}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL — one flat amount for the customer, no invoice allocation ── */}
      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPayModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>₪ תשלום מ{customers.find(c => c.id === payCustomerId)?.name ?? 'לקוח'}</h3>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600, marginTop: '14px' }}>
              סכום שהתקבל
              <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" className="form-input" autoFocus />
            </label>

            <div style={{ marginTop: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500 }}>אמצעי תשלום</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
                {(['מזומן', 'אשראי', 'העברה', "צ'ק"] as PaymentMethod[]).map(m => (
                  <button key={m} type="button" onClick={() => setPayMethod(m)} style={{
                    padding: '7px 4px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                    border: `1px solid ${payMethod === m ? 'var(--primary)' : 'var(--border)'}`,
                    background: payMethod === m ? '#f0fdf4' : '#f8fafc',
                    color: payMethod === m ? 'var(--primary)' : 'var(--text-muted)',
                  }}>
                    {m === 'מזומן' ? '💵' : m === 'אשראי' ? '💳' : m === "צ'ק" ? '📝' : '🏦'} {m}
                  </button>
                ))}
              </div>
              {payMethod === "צ'ק" && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                    מספר צ׳ק
                    <input value={payCheckNumber} onChange={e => setPayCheckNumber(e.target.value)} placeholder="אופציונלי" className="form-input" style={{ margin: 0 }} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                    תאריך פירעון הצ׳ק
                    <input type="date" value={payCheckDate} onChange={e => setPayCheckDate(e.target.value)} className="form-input" style={{ margin: 0 }} />
                  </label>
                </div>
              )}
              {payMethod === 'העברה' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, marginTop: '8px' }}>
                  מספר אסמכתא
                  <input value={payRefNumber} onChange={e => setPayRefNumber(e.target.value)} placeholder="אופציונלי" className="form-input" style={{ margin: 0 }} />
                </label>
              )}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600, marginTop: '12px' }}>
              תאריך תשלום
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="form-input" />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginTop: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={payReceiptIssued} onChange={e => setPayReceiptIssued(e.target.checked)} />
              🧾 הופקה קבלה
            </label>
            {payReceiptIssued && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                מספר קבלה
                <input value={payReceiptNumber} onChange={e => setPayReceiptNumber(e.target.value)} placeholder="מספר קבלה..." className="form-input" style={{ margin: 0 }} />
              </label>
            )}

            {payDebtsByMonth.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>🏷 תייג אילו חשבוניות תשלום זה מכסה <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(אופציונלי, לצורך מעקב בלבד — לא משפיע על הסכום)</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                  {payDebtsByMonth.map(([mk, debts]) => (
                    <div key={mk} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                        <button type="button" onClick={() => toggleMonthPayTags(mk)} style={{ padding: '1px 8px', background: 'transparent', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '10px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                          {debts.every(d => payTagIds.has(d.id)) ? '☐ בטל בחירת חודש' : '☑ בחר חודש'}
                        </button>
                      </div>
                      {debts.map(d => (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input type="checkbox" checked={payTagIds.has(d.id)} onChange={() => togglePayTag(d.id)} />
                          <span style={{ fontSize: 12, flex: 1, color: 'var(--text-muted)' }}>
                            {d.doc_number ? `#${d.doc_number} · ` : ''}{d.date} · {fmt(bal(d))}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowPayModal(false)}>ביטול</Button>
              <Button loading={paySaving} onClick={submitPayment} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                ✓ אשר תשלום
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── WHATSAPP MODAL ── */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setWaModal(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', width: 'min(420px, calc(100vw - 32px))', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', direction: 'rtl' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>💬 שלח הודעת ווצאפ</h3>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>ערוך את הטקסט לפני השליחה</p>
            <textarea value={waModal.text} onChange={e => setWaModal(m => m ? { ...m, text: e.target.value } : m)} rows={5} className="form-input" style={{ resize: 'vertical', fontSize: '13px', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setWaModal(null)}>ביטול</Button>
              <a href={waUrl(waModal.phone, waModal.text)} target="_blank" rel="noopener noreferrer" onClick={() => setWaModal(null)}
                style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: '1.5px solid #16a34a', borderRadius: 9, fontSize: 14, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >📲 פתח ווצאפ</a>
            </div>
          </div>
        </div>
      )}

      <QuickAddCustomerModal
        open={showQuickAddCustomer}
        onClose={() => setShowQuickAddCustomer(false)}
        tenantId={tenantId ?? ''}
        supabase={supabase}
        showToast={showToast}
        onCreated={(c: QuickCustomer) => {
          setDCustomer(c.id)
          reload()
        }}
      />

      {/* ── PRINT CHOICE MODAL ── */}
      {showPrintChoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPrintChoice(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '420px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 700 }}>🖨️ הדפסת כרטסת לקוח</h3>
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>כרטסת לקוח (חשבוניות/זיכויים + מאזן)</div>
              <select
                value={printCustomerId}
                onChange={e => { setPrintCustomerId(e.target.value); setPrintMonths(new Set()); setPrintDateFrom(''); setPrintDateTo('') }}
                className="form-input" style={{ marginBottom: '8px' }}
              >
                <option value="">בחר לקוח...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {printCustomerId && (
                <>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {(['all', 'months', 'range'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPrintRangeMode(m)}
                        style={{
                          flex: 1, padding: '5px 6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px',
                          border: '1px solid ' + (printRangeMode === m ? 'var(--primary)' : 'var(--border)'),
                          background: printRangeMode === m ? 'var(--primary)' : '#fff',
                          color: printRangeMode === m ? '#fff' : 'var(--text)',
                        }}
                      >{m === 'all' ? 'כל התקופה' : m === 'months' ? 'חודשים נבחרים' : 'טווח תאריכים'}</button>
                    ))}
                  </div>

                  {printRangeMode === 'months' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                      {printCustomerMonths.length === 0
                        ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>אין רשומות ללקוח זה</span>
                        : printCustomerMonths.map(mk => (
                          <label key={mk} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '3px 8px', border: '1px solid var(--border)', borderRadius: '14px', cursor: 'pointer', background: printMonths.has(mk) ? '#eff6ff' : '#fff' }}>
                            <input type="checkbox" checked={printMonths.has(mk)} onChange={() => togglePrintMonth(mk)} />
                            {fmtMonth(mk)}
                          </label>
                        ))}
                    </div>
                  )}

                  {printRangeMode === 'range' && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <label style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)' }}>
                        מתאריך
                        <input type="date" value={printDateFrom} onChange={e => setPrintDateFrom(e.target.value)} className="form-input" />
                      </label>
                      <label style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)' }}>
                        עד תאריך
                        <input type="date" value={printDateTo} onChange={e => setPrintDateTo(e.target.value)} className="form-input" />
                      </label>
                    </div>
                  )}
                </>
              )}

              <Button
                onClick={() => { setShowPrintChoice(false); setPrintMode('ledger') }}
                disabled={!printCustomerId || (printRangeMode === 'months' && printMonths.size === 0)}
                style={{ width: '100%' }}
              >🖨️ הדפס כרטסת</Button>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowPrintChoice(false)}>סגור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── HIDDEN PRINT AREA — only visible via @media print ── */}
      {printMode && (
        <div id="print-area" style={{ display: 'none' }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              main { height: auto !important; overflow: visible !important; }
              #print-area, #print-area * { visibility: visible; }
              #print-area { display: block !important; position: absolute; top: 0; right: 0; width: 100%; padding: 24px; direction: rtl; }
              #print-area table { width: 100%; border-collapse: collapse; font-size: 13px; }
              #print-area th, #print-area td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
              #print-area th { background: #eee; }
            }
          `}</style>

          {printMode === 'ledger' && (() => {
            const cust = customers.find(c => c.id === printCustomerId)
            const allDebts = customerDebts.filter(d => d.customer_id === printCustomerId).sort((a, b) => a.date.localeCompare(b.date))
            const allPayments = customerPayments.filter(p => p.customer_id === printCustomerId)

            const sortedPrintMonths = [...printMonths].sort()
            const rangeStart = printRangeMode === 'months' && sortedPrintMonths.length > 0
              ? `${sortedPrintMonths[0]}-01`
              : printRangeMode === 'range' ? (printDateFrom || null) : null

            const inRangeDate = (date: string) => {
              if (printRangeMode === 'months') return sortedPrintMonths.length === 0 || printMonths.has(monthKeyOf(date))
              if (printRangeMode === 'range') return (!printDateFrom || date >= printDateFrom) && (!printDateTo || date <= printDateTo)
              return true
            }

            const debts = allDebts.filter(d => inRangeDate(d.date))
            const payments = allPayments.filter(p => inRangeDate(paymentDateOf(p)))
            const priorDebts = rangeStart ? allDebts.filter(d => d.date < rangeStart) : []
            const priorPayments = rangeStart ? allPayments.filter(p => paymentDateOf(p) < rangeStart) : []
            const openingForReport = (cust?.opening_balance ?? 0) + balanceOf(priorDebts, priorPayments)

            const chargeTotal = debts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
            const creditTotal = debts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
            const paidTotal   = payments.reduce((s, p) => s + Number(p.amount), 0)
            const closingBalance = openingForReport + chargeTotal - creditTotal - paidTotal

            const showOpeningRow = openingForReport !== 0 || !!rangeStart

            const rangeLabel = printRangeMode === 'months'
              ? sortedPrintMonths.map(fmtMonth).join(', ')
              : printRangeMode === 'range'
                ? `${printDateFrom || 'ההתחלה'} — ${printDateTo || 'היום'}`
                : 'כל התקופה'

            // One "אשר תשלום" click historically split across several invoices, each getting its
            // own customer_ledger_payments row sharing a payment_group_id (legacy data — new
            // payments are always already a single row). Regroup by that id so the printed
            // ledger shows one line per real-world payment either way.
            const paymentGroups = new Map<string, CustomerLedgerPayment[]>()
            payments.forEach(p => {
              const key = p.payment_group_id ?? p.id
              const arr = paymentGroups.get(key)
              if (arr) arr.push(p); else paymentGroups.set(key, [p])
            })

            type Ev =
              | { kind: 'debt'; d: CustomerLedgerDebt; number: string; amount: number }
              | { kind: 'payment'; first: CustomerLedgerPayment; amount: number }
            const rawEvents: RawLedgerEvent<Ev>[] = []
            debts.forEach(d => {
              const items = Array.isArray(d.invoices) && d.invoices.length > 0 ? d.invoices : [{ number: d.doc_number ?? '', amount: Number(d.amount) }]
              items.forEach(item => {
                rawEvents.push({
                  date: d.date,
                  delta: d.direction === 'credit' ? -Number(item.amount) : Number(item.amount),
                  data: { kind: 'debt', d, number: item.number, amount: Number(item.amount) },
                })
              })
            })
            paymentGroups.forEach(group => {
              const total = group.reduce((s, g) => s + Number(g.amount), 0)
              rawEvents.push({ date: paymentDateOf(group[0]), delta: -total, data: { kind: 'payment', first: group[0], amount: total } })
            })
            const ledgerEvents = buildLedger(rawEvents, openingForReport)

            return (
              <div>
                <h2 style={{ margin: '0 0 4px' }}>{tenantName} — כרטסת לקוח: {cust?.name ?? ''}</h2>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>תקופה: {rangeLabel}</div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>תאריך הדפסה: {fmtDMY(new Date())}</div>
                <table>
                  <thead><tr><th>תאריך</th><th>מספר</th><th style={{ width: 46 }}>סוג</th><th style={{ width: 30 }}>🏷</th><th>הערה</th><th>סכום</th><th>יתרה</th></tr></thead>
                  <tbody>
                    {showOpeningRow && (
                      <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                        <td>—</td>
                        <td>—</td>
                        <td>יתרת פתיחה</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(openingForReport)}</td>
                      </tr>
                    )}
                    {ledgerEvents.map((ev, idx) => {
                      if (ev.data.kind === 'debt') {
                        const { d, number, amount } = ev.data
                        return (
                          <tr key={`d-${d.id}-${idx}`}>
                            <td>{fmtDMY(d.date)}</td>
                            <td>{number || '—'}</td>
                            <td style={{ width: 46, textAlign: d.direction === 'credit' ? 'left' : 'right' }}>{d.direction === 'credit' ? 'זיכוי' : 'חיוב'}</td>
                            <td style={{ width: 30, textAlign: 'center' }}>{d.is_closed ? '🏷' : ''}</td>
                            <td>{d.description || ''}</td>
                            <td style={{ textAlign: d.direction === 'credit' ? 'left' : 'right' }}>{d.direction === 'credit' ? '−' : ''}{fmt(amount)}</td>
                            <td>{fmt(ev.runningBalance)}</td>
                          </tr>
                        )
                      }
                      const { first, amount } = ev.data
                      return (
                        <tr key={`p-${first.id}-${idx}`} style={{ background: '#f5faf6' }}>
                          <td>{fmtDMY(paymentDateOf(first))}</td>
                          <td>—</td>
                          <td style={{ width: 46 }}>תשלום</td>
                          <td style={{ width: 30, textAlign: 'center' }}>{first.receipt_issued ? '🧾' : '💰'}</td>
                          <td>{first.receipt_issued ? `קבלה #${first.receipt_number || '—'}` : first.payment_method}</td>
                          <td style={{ textAlign: 'left' }}>−{fmt(amount)}</td>
                          <td>{fmt(ev.runningBalance)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>
                  סה&quot;כ חיוב: {fmt(chargeTotal)} &nbsp; | &nbsp; סה&quot;כ זיכוי: {fmt(creditTotal)} &nbsp; | &nbsp; שולם: {fmt(paidTotal)} &nbsp; | &nbsp; יתרה: {fmt(closingBalance)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
