'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { reconcileCustomerLedgerPayment } from '@/lib/debts/reconcileCustomerLedgerPayment'
import QuickAddCustomerModal, { QuickCustomer } from '@/components/customers/QuickAddCustomerModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type Direction = 'charge' | 'credit'
type PaymentMethod = 'מזומן' | 'אשראי' | "צ'ק" | 'העברה'

interface InvoiceEntry {
  type: 'invoice' | 'karteset'
  number: string
  amount: string
  date: string
  direction: Direction
  notes: string
}

interface CustomerLedgerDebt {
  id: string; tenant_id: string; customer_id: string | null
  amount: number; paid: number; description: string | null
  date: string; is_closed: boolean; created_at: string
  doc_type: string | null; doc_number: string | null
  direction: Direction
  invoices: { type: string; number: string; amount: number; description?: string }[] | null
}

interface Customer {
  id: string; name: string; phone: string | null
  opening_balance: number
}

type Filter = 'open' | 'closed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDMY = (d: string | Date) => {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
    if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`
    d = new Date(d)
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}
const todayISO = () => new Date().toISOString().slice(0, 10)
// direction: 'charge' = the customer owes the business more (invoice on credit),
// 'credit' = reduces what the customer owes (credit note/refund).
const bal = (d: { amount: number; paid: number; direction: Direction }) =>
  d.direction === 'credit' ? -Number(d.amount) : Math.max(0, Number(d.amount) - Number(d.paid))
const EMPTY_INV = (): InvoiceEntry => ({ type: 'invoice', number: '', amount: '', date: todayISO(), direction: 'charge', notes: '' })

const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('972')) digits = digits.startsWith('0') ? '972' + digits.slice(1) : '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

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

export default function CustomerTrackingClient() {
  const supabase    = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [customerDebts, setCustomerDebts] = useState<CustomerLedgerDebt[]>([])
  const [customers, setCustomers]         = useState<Customer[]>([])

  // Row selection
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  // Payment modal — pays one or several open debts of one customer at once.
  // No check-series/calendar system for customers — a single "צ'ק" payment
  // just carries an optional check number/date inline.
  const [showPayModal, setShowPayModal]   = useState(false)
  const [payCustomerId, setPayCustomerId] = useState<string | null>(null)
  const [paySelectedIds, setPaySelectedIds] = useState<Set<string>>(new Set())
  const [payAllocAmounts, setPayAllocAmounts] = useState<Record<string, string>>({})
  const [payMethod, setPayMethod] = useState<PaymentMethod>('מזומן')
  const [payDate, setPayDate]     = useState(todayISO())
  const [payCheckNumber, setPayCheckNumber] = useState('')
  const [payCheckDate, setPayCheckDate]     = useState('')
  const [payRefNumber, setPayRefNumber]     = useState('')
  const [payQuickAmount, setPayQuickAmount] = useState('')
  const [payQuickTarget, setPayQuickTarget] = useState('auto')
  const [paySaving, setPaySaving] = useState(false)

  // Quick-add-customer modal
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)

  // Tenant name (for WA messages)
  const [tenantName, setTenantName] = useState('AutoFlow')
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

  // ── Tenant ────────────────────────────────────────────────────────────────

  const resolveTenant = useCallback(async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    if (!profile) return null
    tenantIdRef.current = profile.tenantId
    return tenantIdRef.current
  }, [profile])

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const tid = await resolveTenant()
    if (!tid) return
    setLoading(true)
    const [custDebtRes, custRes] = await Promise.all([
      supabase.from('customer_ledger_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('customers').select('id,name,phone,opening_balance').eq('tenant_id', tid).order('name'),
    ])
    if (custDebtRes.data) setCustomerDebts(custDebtRes.data)
    if (custRes.data)     setCustomers(custRes.data)
    else if (custRes.error) showToast('שגיאה בטעינת לקוחות: ' + custRes.error.message, 'error')
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    setLoading(false)
  }, [supabase, resolveTenant, showToast, profile])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // Deep-link: ?open=<customerId>
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (didAutoOpen.current || loading) return
    didAutoOpen.current = true
    const openId = new URLSearchParams(window.location.search).get('open')
    if (openId && customers.some(c => c.id === openId)) {
      setSearch(customers.find(c => c.id === openId)!.name)
      setOpenCustomerKeys(prev => new Set(prev).add(customerKeyOf(openId)))
    }
  }, [loading, customers])

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('customer-tracking-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_ledger_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

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
    const tid = tenantIdRef.current!
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
    setDSaving(false); setShowDebtModal(false); setSelectedId(null); loadAll()
  }

  const deleteDebt = async (id: string) => {
    if (!confirm('למחוק רשומה זו?')) return
    await supabase.from('customer_ledger_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); setSelectedId(null); loadAll()
  }

  const addDebtForCustomer = (custId: string) => {
    setEditDebt(null); setDCustomer(custId); setDNotes(''); setDInvoices([EMPTY_INV()])
    setShowDebtModal(true)
  }

  // ── Payment (one or several open debts of one customer, in one action) ────

  const payOpenDebts = customerDebts.filter(d => d.customer_id === payCustomerId && !d.is_closed && d.direction === 'charge')
  const payDebtsByMonth = (() => {
    const map: Record<string, CustomerLedgerDebt[]> = {}
    payOpenDebts.forEach(d => {
      const mk = monthKeyOf(d.date)
      if (!map[mk]) map[mk] = []
      map[mk].push(d)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  })()
  const payTotalSelected = Array.from(paySelectedIds).reduce((s, id) => s + (parseFloat(payAllocAmounts[id] ?? '0') || 0), 0)

  const openPayCustomer = (customerId: string | null, preselectId?: string) => {
    setPayCustomerId(customerId)
    setPayMethod('מזומן'); setPayDate(todayISO()); setPayCheckNumber(''); setPayCheckDate(todayISO())
    setPayRefNumber(''); setPayQuickAmount(''); setPayQuickTarget('auto')
    if (preselectId) {
      const d = customerDebts.find(x => x.id === preselectId)
      setPaySelectedIds(new Set([preselectId]))
      setPayAllocAmounts(d ? { [preselectId]: String(bal(d).toFixed(2)) } : {})
    } else {
      setPaySelectedIds(new Set()); setPayAllocAmounts({})
    }
    setShowPayModal(true)
  }

  // Quick-fill: type one total amount, either spread oldest-open-first (auto)
  // or apply the whole amount to one chosen invoice (partial payment support) —
  // just pre-fills the manual checkbox/amount list below, user can still edit before confirming.
  const applyQuickAmount = () => {
    const amt = parseFloat(payQuickAmount) || 0
    if (amt <= 0) { showToast('סכום לא תקין', 'error'); return }
    if (payQuickTarget === 'auto') {
      const sorted = [...payOpenDebts].sort((a, b) => a.date.localeCompare(b.date))
      let remaining = amt
      const ids = new Set<string>()
      const allocs: Record<string, string> = {}
      for (const d of sorted) {
        if (remaining <= 0) break
        const take = Math.min(bal(d), remaining)
        if (take <= 0) continue
        ids.add(d.id)
        allocs[d.id] = take.toFixed(2)
        remaining -= take
      }
      setPaySelectedIds(ids)
      setPayAllocAmounts(allocs)
    } else {
      const d = payOpenDebts.find(x => x.id === payQuickTarget)
      if (!d) return
      const take = Math.min(bal(d), amt)
      setPaySelectedIds(new Set([d.id]))
      setPayAllocAmounts({ [d.id]: take.toFixed(2) })
    }
  }

  const togglePayDebt = (d: CustomerLedgerDebt) => {
    setPaySelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(d.id)) {
        next.delete(d.id)
        setPayAllocAmounts(a => { const c = { ...a }; delete c[d.id]; return c })
      } else {
        next.add(d.id)
        setPayAllocAmounts(a => ({ ...a, [d.id]: a[d.id] ?? String(bal(d).toFixed(2)) }))
      }
      return next
    })
  }

  const selectAllPayDebts = () => {
    setPaySelectedIds(new Set(payOpenDebts.map(d => d.id)))
    setPayAllocAmounts(Object.fromEntries(payOpenDebts.map(d => [d.id, String(bal(d).toFixed(2))])))
  }

  const submitPayment = async () => {
    if (paySelectedIds.size === 0) { showToast('בחר לפחות שורה אחת לתשלום', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return

    const allocations = Array.from(paySelectedIds)
      .map(id => ({ customer_ledger_debt_id: id, amount: parseFloat(payAllocAmounts[id] ?? '0') || 0 }))
      .filter(a => a.amount > 0)
    if (allocations.length === 0) { showToast('סכום לא תקין', 'error'); return }

    const refNumber = payMethod === "צ'ק" ? payCheckNumber : payMethod === 'העברה' ? payRefNumber : ''

    setPaySaving(true)
    const { error } = await reconcileCustomerLedgerPayment(supabase, tid, allocations, {
      payment_method: payMethod,
      check_number: refNumber || null,
      check_date: payMethod === "צ'ק" ? (payCheckDate || null) : null,
      notes: null,
    })
    if (error) { showToast('שגיאה בתשלום: ' + error, 'error'); setPaySaving(false); return }

    const total = allocations.reduce((s, a) => s + a.amount, 0)
    const custName = customers.find(c => c.id === payCustomerId)?.name ?? 'לקוח'
    await supabase.from('income').insert({
      tenant_id: tid, date: payDate, category: 'לקוחות',
      description: `תשלום מלקוח ${custName}`, amount: total,
      customer_id: payCustomerId, payment_method: payMethod,
      payment_ref: refNumber || null,
    })

    showToast('תשלום נרשם ✓', 'success')
    setPaySaving(false); setShowPayModal(false); loadAll()
  }

  const toggleClose = async (id: string, current: boolean) => {
    await supabase.from('customer_ledger_debts').update({ is_closed: !current }).eq('id', id)
    loadAll()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  const openCustTotal = customerDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)

  // ── Selected item info ────────────────────────────────────────────────────

  const selectedDebt = selectedId ? customerDebts.find(d => d.id === selectedId) : null

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

  const StatusChip = ({ debt }: { debt: CustomerLedgerDebt }) => {
    if (debt.direction === 'credit')
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>זיכוי</span>
    if (debt.is_closed)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>שולם ✓</span>
    if (Number(debt.paid) > 0)
      return <span style={{ padding: '2px 9px', borderRadius: '10px', fontSize: '11px', background: '#fef3c7', color: 'var(--warning)', fontWeight: 600 }}>חלקי</span>
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
      סוג: d.direction === 'credit' ? 'זיכוי' : 'חיוב', סכום: d.amount, שולם: d.paid, יתרה: bal(d),
      תאריך: d.date, סטטוס: d.is_closed ? 'סגור' : 'פתוח', תיאור: d.description ?? '',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חשבוניות וזיכויים')
    XLSX.writeFile(wb, 'מעקב-לקוחות.xlsx')
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const tid = tenantIdRef.current
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
      const paid   = direction === 'credit' ? 0 : (parseFloat(String(r['שולם'] ?? '')) || 0)
      const isClosed = direction === 'credit' || String(r['סטטוס'] ?? '').includes('סגור') || paid >= amount && amount > 0
      return {
        id: crypto.randomUUID(), tenant_id: tid,
        customer_id: customer?.id ?? null,
        amount, paid, direction, is_closed: isClosed,
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
    loadAll()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', fontSize: '14px' }}>
      טוען...
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
        iconBg="linear-gradient(135deg,#0891b2,#22d3ee)"
        iconShadow="#0891b244"
        title="מעקב לקוחות"
        subtitle="חשבוניות, זיכויים ותשלומים לפי לקוח"
      />

      <div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => openDebtModal()}>+ הוסף חשבונית/זיכוי</Button>
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

        {/* Selection action bar */}
        {selectedId && selectedDebt && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>✓ שורה נבחרה</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
              {customers.find(c => c.id === selectedDebt.customer_id)?.name ?? 'ללא לקוח'} · <strong>{fmt(bal(selectedDebt))}</strong>
            </span>
            {customers.find(c => c.id === selectedDebt.customer_id)?.phone && (
              <button
                onClick={() => {
                  const cust = customers.find(c => c.id === selectedDebt.customer_id)!
                  setWaModal({ phone: cust.phone!, text: `שלום ${cust.name}, ברצוני לבדוק חוב בסך ${fmt(bal(selectedDebt))}.\nתודה!\n${tenantName}` })
                }}
                style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >💬 ווצאפ</button>
            )}
            {!selectedDebt.is_closed && bal(selectedDebt) > 0 && selectedDebt.direction === 'charge' && (
              <button onClick={() => openPayCustomer(selectedDebt.customer_id, selectedId)} style={{ padding: '5px 12px', background: '#f0fdf6', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>₪ שלם</button>
            )}
            <button onClick={() => toggleClose(selectedId, selectedDebt.is_closed)} style={{ padding: '5px 10px', background: selectedDebt.is_closed ? '#fef2f2' : '#f0fdf6', color: selectedDebt.is_closed ? 'var(--danger)' : '#16a34a', border: '1px solid', borderColor: selectedDebt.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{selectedDebt.is_closed ? '↩ פתח' : '✓ סגור'}</button>
            <button onClick={() => openDebtModal(selectedDebt)} style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>✏️ ערוך</button>
            <button onClick={() => deleteDebt(selectedId)} style={{ padding: '5px 10px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>🗑 מחק</button>
            <button onClick={() => setSelectedId(null)} style={{ padding: '5px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {(() => {
          const allCustIds = [...new Set(customerDebts.map(d => d.customer_id))]
          const groups = allCustIds.map(cid => {
            const debts = customerDebts.filter(d => d.customer_id === cid)
            const cust = customers.find(c => c.id === cid)
            const totalBal = debts.reduce((s, d) => s + bal(d), 0)

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
            const months = Object.keys(monthMap).sort().reverse()

            return { cid, cust, totalBal, monthMap, months }
          }).filter(Boolean) as {
            cid: string | null; cust: Customer | undefined; totalBal: number
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
                    </div>
                  </div>

                  {isOpen && group.months.map((mk, mIdx) => {
                    const monthDebts = group.monthMap[mk]
                    const carryOver = group.months.slice(mIdx + 1).reduce(
                      (s, m) => s + group.monthMap[m].reduce((ss, d) => ss + bal(d), 0), 0)
                    const monthChargeTotal = monthDebts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
                    const monthCreditTotal = monthDebts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
                    const monthNetTotal    = monthChargeTotal - monthCreditTotal
                    const monthPaidTotal   = monthDebts.reduce((s, d) => s + Number(d.paid), 0)
                    const monthBalance     = monthDebts.reduce((s, d) => s + bal(d), 0)
                    const monthCollapsed   = !expandedMonthKeys.has(monthKeyFor(group.cid, mk))

                    return (
                      <div key={mk} style={{ borderBottom: mIdx < group.months.length - 1 ? '1px solid var(--border)' : 'none', padding: '14px 16px' }}>

                        <div
                          onClick={() => toggleMonthCollapsed(group.cid, mk)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: monthCollapsed ? 0 : '10px', cursor: 'pointer' }}
                        >
                          <span style={{ display: 'inline-block', transition: 'transform .15s', transform: monthCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', color: 'var(--text-muted)', fontSize: '12px' }}>›</span>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                          {monthBalance <= 0
                            ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#f0fdf6', color: '#16a34a', fontWeight: 600 }}>סגור ✓</span>
                            : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#fef2f2', color: 'var(--danger)', fontWeight: 600 }}>פתוח</span>}
                          <span style={{ marginRight: 'auto', fontSize: '13px', fontWeight: 700, color: monthBalance > 0 ? 'var(--danger)' : '#16a34a' }}>
                            יתרה: {fmt(monthBalance)}
                          </span>
                        </div>

                        {!monthCollapsed && carryOver !== 0 && (
                          <div style={{ padding: '7px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                            ↩ יתרה מחודשים קודמים: {fmt(carryOver)}
                          </div>
                        )}

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
                            {monthDebts.flatMap(d => {
                              const items = Array.isArray(d.invoices) && d.invoices.length > 0
                                ? d.invoices
                                : [{ type: d.doc_type ?? 'invoice', number: d.doc_number ?? '', amount: Number(d.amount) }]
                              return items.map((item, idx) => (
                                <tr
                                  key={`${d.id}-${idx}`}
                                  onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                                  className="tr-hover"
                                  style={{ cursor: 'pointer', background: selectedId === d.id ? '#eff6ff' : d.is_closed && d.direction === 'charge' ? '#fafafa' : undefined }}
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
                                    <button
                                      onClick={e => { e.stopPropagation(); openDebtModal(d) }}
                                      title="ערוך"
                                      style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                    >✏️</button>
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteDebt(d.id) }}
                                      title="מחק"
                                      style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                    >🗑</button>
                                  </td>
                                </tr>
                              ))
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border)', background: '#f8fafc' }}>
                              <td colSpan={5} style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                                  <span>סה&quot;כ חיוב: <strong style={{ color: 'var(--text)' }}>{fmt(monthChargeTotal)}</strong></span>
                                  {monthCreditTotal > 0 && <span>סה&quot;כ זיכוי: <strong style={{ color: 'var(--danger)' }}>{fmt(monthCreditTotal)}</strong></span>}
                                  <span>נטו: <strong style={{ color: 'var(--text)' }}>{fmt(monthNetTotal)}</strong></span>
                                  {monthPaidTotal > 0 && <span>שולם: <strong style={{ color: '#16a34a' }}>{fmt(monthPaidTotal)}</strong></span>}
                                  <span>יתרה: <strong style={{ color: monthBalance > 0 ? 'var(--danger)' : '#16a34a' }}>{fmt(monthBalance)}</strong></span>
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )})}
            </div>
          )
        })()}
      </div>

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

      {/* ── PAYMENT MODAL — pick one or several open debts + payment method ── */}
      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPayModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>₪ תשלום מ{customers.find(c => c.id === payCustomerId)?.name ?? 'לקוח'}</h3>

            {payOpenDebts.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין חובות פתוחים ללקוח זה</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '14px 0', padding: '10px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, flex: 1 }}>
                    סכום שהתקבל
                    <input type="number" step="0.01" value={payQuickAmount} onChange={e => setPayQuickAmount(e.target.value)} placeholder="0.00" className="form-input" style={{ margin: 0 }} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, flex: 1.6 }}>
                    שיוך
                    <select value={payQuickTarget} onChange={e => setPayQuickTarget(e.target.value)} className="form-input" style={{ margin: 0 }}>
                      <option value="auto">אוטומטי (מהישן ביותר)</option>
                      {payOpenDebts.map(d => (
                        <option key={d.id} value={d.id}>{d.doc_number ? `#${d.doc_number} · ` : ''}{fmtDMY(d.date)} · יתרה {fmt(bal(d))}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={applyQuickAmount} style={{ padding: '8px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>החל</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>בחר אילו חודשים לשלם</span>
                  <button type="button" onClick={selectAllPayDebts} style={{ padding: '4px 10px', background: '#f0fdf4', color: 'var(--primary)', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>☑ שלם הכל</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                  {payDebtsByMonth.map(([mk, debts]) => (
                    <div key={mk} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>{fmtMonth(mk)}</div>
                      {debts.map(d => {
                        const checked = paySelectedIds.has(d.id)
                        return (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <input type="checkbox" checked={checked} onChange={() => togglePayDebt(d)} />
                            <span style={{ fontSize: 12, flex: 1, color: 'var(--text-muted)' }}>
                              {d.doc_number ? `#${d.doc_number} · ` : ''}{d.date} · יתרה {fmt(bal(d))}
                            </span>
                            {checked && (
                              <input
                                type="number" step="0.01"
                                value={payAllocAmounts[d.id] ?? ''}
                                onChange={e => setPayAllocAmounts(a => ({ ...a, [d.id]: e.target.value }))}
                                style={{ width: 90, padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                {paySelectedIds.size > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: 'left' }}>
                    סה&quot;כ לתשלום: {fmt(payTotalSelected)}
                  </div>
                )}

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
              </>
            )}

            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowPayModal(false)}>ביטול</Button>
              {payOpenDebts.length > 0 && (
                <Button loading={paySaving} onClick={submitPayment} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  ✓ אשר תשלום
                </Button>
              )}
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
        tenantId={tenantIdRef.current ?? ''}
        supabase={supabase}
        showToast={showToast}
        onCreated={(c: QuickCustomer) => {
          setCustomers(prev => [...prev, { ...c, opening_balance: 0 }].sort((a, b) => a.name.localeCompare(b.name, 'he')))
          setDCustomer(c.id)
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

            const sortedPrintMonths = [...printMonths].sort()
            const rangeStart = printRangeMode === 'months' && sortedPrintMonths.length > 0
              ? `${sortedPrintMonths[0]}-01`
              : printRangeMode === 'range' ? (printDateFrom || null) : null

            const inRange = (d: CustomerLedgerDebt) => {
              if (printRangeMode === 'months') return sortedPrintMonths.length === 0 || printMonths.has(monthKeyOf(d.date))
              if (printRangeMode === 'range') return (!printDateFrom || d.date >= printDateFrom) && (!printDateTo || d.date <= printDateTo)
              return true
            }

            const debts = allDebts.filter(inRange)
            const priorDebts = rangeStart ? allDebts.filter(d => d.date < rangeStart) : []
            const openingForReport = (cust?.opening_balance ?? 0) + priorDebts.reduce((s, d) => s + bal(d), 0)

            const chargeTotal = debts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
            const creditTotal = debts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
            const paidTotal   = debts.reduce((s, d) => s + Number(d.paid), 0)

            let running = openingForReport
            const showOpeningRow = openingForReport !== 0 || !!rangeStart

            const rangeLabel = printRangeMode === 'months'
              ? sortedPrintMonths.map(fmtMonth).join(', ')
              : printRangeMode === 'range'
                ? `${printDateFrom || 'ההתחלה'} — ${printDateTo || 'היום'}`
                : 'כל התקופה'

            return (
              <div>
                <h2 style={{ margin: '0 0 4px' }}>{tenantName} — כרטסת לקוח: {cust?.name ?? ''}</h2>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>תקופה: {rangeLabel}</div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>תאריך הדפסה: {fmtDMY(new Date())}</div>
                <table>
                  <thead><tr><th>תאריך</th><th>מספר</th><th style={{ width: 46 }}>סוג</th><th>הערה</th><th>סכום</th><th>יתרה בפועל</th></tr></thead>
                  <tbody>
                    {showOpeningRow && (
                      <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                        <td>—</td>
                        <td>—</td>
                        <td>יתרת פתיחה</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{fmt(openingForReport)}</td>
                      </tr>
                    )}
                    {debts.flatMap(d => {
                      const items = Array.isArray(d.invoices) && d.invoices.length > 0 ? d.invoices : [{ number: d.doc_number ?? '', amount: Number(d.amount) }]
                      return items.map((item, idx) => {
                        running += d.direction === 'credit' ? -Number(item.amount) : Number(item.amount)
                        // Net out payments recorded against this debt once its rows are done,
                        // matching bal()/openingForReport above — otherwise a payment never
                        // shows up in the printed running balance even though it's listed as "שולם".
                        if (idx === items.length - 1 && d.direction !== 'credit') running -= Number(d.paid)
                        return (
                          <tr key={`${d.id}-${idx}`}>
                            <td>{fmtDMY(d.date)}</td>
                            <td>{item.number || '—'}</td>
                            <td style={{ width: 46, textAlign: d.direction === 'credit' ? 'left' : 'right' }}>{d.direction === 'credit' ? 'זיכוי' : 'חיוב'}</td>
                            <td>{d.description || ''}</td>
                            <td style={{ textAlign: d.direction === 'credit' ? 'left' : 'right' }}>{d.direction === 'credit' ? '−' : ''}{fmt(item.amount)}</td>
                            <td>{fmt(running)}</td>
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>
                  סה&quot;כ חיוב: {fmt(chargeTotal)} &nbsp; | &nbsp; סה&quot;כ זיכוי: {fmt(creditTotal)} &nbsp; | &nbsp; שולם: {fmt(paidTotal)} &nbsp; | &nbsp; יתרה בפועל: {fmt(running)}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
