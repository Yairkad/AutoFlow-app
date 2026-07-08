'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import ExcelMenu from '@/components/ui/ExcelMenu'
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
import { reconcileSupplierPayment } from '@/lib/debts/reconcileSupplierPayment'
import ScheduledPaymentsModal from '@/components/expenses/ScheduledPaymentsModal'
import QuickAddSupplierModal, { QuickSupplier } from '@/components/suppliers/QuickAddSupplierModal'

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

interface SupplierDebt {
  id: string; tenant_id: string; supplier_id: string | null
  amount: number; paid: number; description: string | null
  date: string; is_closed: boolean; created_at: string
  doc_type: string | null; doc_number: string | null
  direction: Direction
  invoices: { type: string; number: string; amount: number; description?: string }[] | null
}

interface ScheduledPayment {
  id: string; tenant_id: string; description: string; amount: number
  due_date: string; payment_method: 'check' | 'transfer'
  supplier_id: string | null; category: string | null
  is_paid: boolean; paid_date: string | null; expense_id: string | null; notes: string | null
  check_number: string | null; series_id: string | null; allocation_ignored: boolean
}

interface SupplierDebtPayment {
  id: string; supplier_debt_id: string; scheduled_payment_id: string | null; amount: number
}

interface Supplier {
  id: string; name: string; phone: string | null; contact_name: string | null
  opening_balance: number
}

type Tab    = 'byMonth' | 'calendar'
type Filter = 'open' | 'closed' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)
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
const daysUntilDate = (iso: string) => { const t = new Date(); t.setHours(0,0,0,0); const d = new Date(iso + 'T00:00:00'); d.setHours(0,0,0,0); return Math.round((d.getTime()-t.getTime())/86400000) }

// ── Shared styles ─────────────────────────────────────────────────────────────

const thSt: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '11px',
  background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px',
}
const tdSt: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierTrackingClient() {
  const supabase    = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantIdRef = useRef<string | null>(null)
  const { showToast } = useToast()

  const [tab, setTab]       = useState<Tab>('byMonth')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Data
  const [supplierDebts, setSupplierDebts] = useState<SupplierDebt[]>([])
  const [suppliers, setSuppliers]         = useState<Supplier[]>([])
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [debtPayments, setDebtPayments]   = useState<SupplierDebtPayment[]>([])
  const [expenseCats, setExpenseCats]     = useState<string[]>(['ספקים', 'אחר'])
  const autoExpenseDoneRef = useRef(false)

  // Row selection
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Which supplier cards are expanded (collapsed by default — click to open detail)
  const [openSupplierKeys, setOpenSupplierKeys] = useState<Set<string>>(new Set())
  const supplierKeyOf = (sid: string | null) => sid ?? '__none__'
  const toggleSupplierOpen = (sid: string | null) => setOpenSupplierKeys(prev => {
    const k = supplierKeyOf(sid)
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Which month blocks inside a supplier card are expanded (collapsed by default; click a month to open just that one)
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<Set<string>>(new Set())
  const monthKeyFor = (sid: string | null, mk: string) => `${supplierKeyOf(sid)}::${mk}`
  const toggleMonthCollapsed = (sid: string | null, mk: string) => setExpandedMonthKeys(prev => {
    const k = monthKeyFor(sid, mk)
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Supplier debt form (each line = its own invoice/credit)
  const [showSuppModal, setShowSuppModal] = useState(false)
  const [editSupp, setEditSupp]           = useState<SupplierDebt | null>(null)
  const [sSupplier, setSSupplier] = useState('')
  const [sNotes, setSNotes]       = useState('')
  const [sInvoices, setSInvoices] = useState<InvoiceEntry[]>([EMPTY_INV()])
  const [sSaving, setSsaving]     = useState(false)

  // Retroactively allocate an already-issued check/payment against open debts
  const [allocatingPayment, setAllocatingPayment] = useState<ScheduledPayment | null>(null)
  const [allocSelectedIds, setAllocSelectedIds] = useState<Set<string>>(new Set())
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({})
  const [allocSaving, setAllocSaving] = useState(false)
  const [allocShowClosed, setAllocShowClosed] = useState(false)

  // Payment modal — pays one or several open debts of one supplier at once
  const [showPayModal, setShowPayModal]   = useState(false)
  const [paySupplierId, setPaySupplierId] = useState<string | null>(null)
  const [paySelectedIds, setPaySelectedIds] = useState<Set<string>>(new Set())
  const [payAllocAmounts, setPayAllocAmounts] = useState<Record<string, string>>({})
  const [payMethod, setPayMethod] = useState<PaymentMethod>('מזומן')
  const [payDate, setPayDate]     = useState(todayISO())
  const [paySaving, setPaySaving] = useState(false)

  // Quick-add-supplier modal
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false)

  // Tenant name (for WA messages)
  const [tenantName, setTenantName] = useState('AutoFlow')
  const [waModal, setWaModal] = useState<{ phone: string; text: string } | null>(null)

  // Scheduled payments (checks) modal
  const [schedModal, setSchedModal] = useState(false)
  const [schedInitialSupplierId, setSchedInitialSupplierId] = useState<string | undefined>(undefined)

  // Styled printing — pick what to print, then render a hidden print-only area
  const [showPrintChoice, setShowPrintChoice] = useState(false)
  const [printMode, setPrintMode] = useState<'ledger' | 'calendar' | null>(null)
  const [printSupplierId, setPrintSupplierId] = useState<string>('')
  const [printRangeMode, setPrintRangeMode] = useState<'all' | 'months' | 'range'>('all')
  const [printMonths, setPrintMonths] = useState<Set<string>>(new Set())
  const [printDateFrom, setPrintDateFrom] = useState('')
  const [printDateTo, setPrintDateTo] = useState('')

  const printSupplierMonths = (() => {
    const set = new Set(supplierDebts.filter(d => d.supplier_id === printSupplierId).map(d => monthKeyOf(d.date)))
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
    const [suppDebtRes, suppRes, paymentsRes, debtPaymentsRes, catRes] = await Promise.all([
      supabase.from('supplier_debts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('suppliers').select('id,name,phone,contact_name,opening_balance').eq('tenant_id', tid).order('name'),
      supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date'),
      supabase.from('supplier_debt_payments').select('*').eq('tenant_id', tid),
      supabase.from('expense_categories').select('name').eq('tenant_id', tid).order('created_at'),
    ])
    if (suppDebtRes.data) setSupplierDebts(suppDebtRes.data)
    if (suppRes.data)     setSuppliers(suppRes.data)
    else if (suppRes.error) showToast('שגיאה בטעינת ספקים: ' + suppRes.error.message, 'error')
    if (profile?.tenant?.name) setTenantName(profile.tenant.name as string)
    const payments: ScheduledPayment[] = paymentsRes.data ?? []
    setScheduledPayments(payments)
    setDebtPayments(debtPaymentsRes.data ?? [])
    if (catRes.data && catRes.data.length > 0) setExpenseCats(catRes.data.map(r => r.name))
    setLoading(false)

    // Auto-expense overdue scheduled payments — runs once per session
    if (!autoExpenseDoneRef.current) {
      autoExpenseDoneRef.current = true
      const today = new Date().toISOString().slice(0, 10)
      const overdue = payments.filter(p => !p.is_paid && p.due_date <= today)
      if (overdue.length > 0) {
        for (const p of overdue) {
          const expRes = await supabase.from('expenses').insert({
            tenant_id: tid, date: p.due_date,
            category: p.category || 'ספקים',
            description: p.description, amount: p.amount,
            supplier_id: p.supplier_id,
            payment_method: p.payment_method === 'check' ? "צ'ק" : 'העברה',
            payment_ref: p.notes || null,
          }).select('id').single()
          if (!expRes.error) {
            await supabase.from('scheduled_payments').update({
              is_paid: true, paid_date: today, expense_id: expRes.data.id,
            }).eq('id', p.id)
          }
        }
        showToast(`${overdue.length} תשלומים נרשמו אוטומטית כהוצאות ✓`, 'info')
        const refreshed = await supabase.from('scheduled_payments').select('*').eq('tenant_id', tid).order('due_date')
        setScheduledPayments(refreshed.data ?? [])
      }
    }
  }, [supabase, resolveTenant, showToast, profile])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { setSelectedId(null); setFilter('open'); setSearch('') }, [tab])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // Deep-link: ?open=<supplierId>
  const didAutoOpen = useRef(false)
  useEffect(() => {
    if (didAutoOpen.current || loading) return
    didAutoOpen.current = true
    const openId = new URLSearchParams(window.location.search).get('open')
    if (openId && suppliers.some(s => s.id === openId)) {
      setSearch(suppliers.find(s => s.id === openId)!.name)
      setOpenSupplierKeys(prev => new Set(prev).add(supplierKeyOf(openId)))
    }
  }, [loading, suppliers])

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ch = supabase.channel('supplier-tracking-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_payments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_debt_payments' }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, loadAll])

  // ── Supplier debt CRUD ────────────────────────────────────────────────────

  const openSuppModal = (d?: SupplierDebt) => {
    if (d) {
      setEditSupp(d); setSSupplier(d.supplier_id ?? ''); setSNotes('')
      const existing = Array.isArray(d.invoices) && d.invoices.length > 0
        ? d.invoices.map(i => ({ type: i.type as 'invoice' | 'karteset', number: i.number, amount: String(i.amount), date: d.date, direction: d.direction, notes: d.description ?? '' }))
        : d.doc_number
          ? [{ type: (d.doc_type ?? 'invoice') as 'invoice' | 'karteset', number: d.doc_number, amount: String(d.amount), date: d.date, direction: d.direction, notes: d.description ?? '' }]
          : [{ ...EMPTY_INV(), date: d.date, direction: d.direction, notes: d.description ?? '' }]
      setSInvoices(existing)
    } else {
      setEditSupp(null); setSSupplier(''); setSNotes(''); setSInvoices([EMPTY_INV()])
    }
    setShowSuppModal(true)
  }

  const addInvoiceLine = () => setSInvoices(prev => [...prev, EMPTY_INV()])
  const removeInvoiceLine = (i: number) => setSInvoices(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)
  const updateInvoiceLine = (i: number, field: keyof InvoiceEntry, val: string) =>
    setSInvoices(prev => prev.map((inv, idx) => idx === i ? { ...inv, [field]: val } : inv))

  const invoicesTotal = sInvoices.reduce((s, inv) => s + (inv.direction === 'credit' ? -1 : 1) * (parseFloat(inv.amount) || 0), 0)

  const saveSuppDebt = async () => {
    const validLines = sInvoices.filter(i => i.number.trim() || parseFloat(i.amount) > 0)
    if (validLines.length === 0) { showToast('נא למלא לפחות שורה אחת', 'error'); return }
    if (validLines.some(l => !l.date)) { showToast('נא לבחור תאריך לכל שורה', 'error'); return }
    const tid = tenantIdRef.current!
    setSsaving(true)

    if (editSupp) {
      // Editing an existing row (possibly a legacy multi-invoice bundle) — single-row update
      const invoicesData = validLines.map(i => ({ type: i.type, number: i.number.trim(), amount: parseFloat(i.amount) || 0 }))
      const total = invoicesData.reduce((s, i) => s + i.amount, 0)
      const row = {
        supplier_id: sSupplier || null,
        amount: total || parseFloat(validLines[0]?.amount) || 0,
        description: validLines[0]?.notes.trim() || sNotes.trim() || null,
        date: validLines[0]?.date || todayISO(),
        doc_type: validLines[0]?.type ?? 'invoice',
        doc_number: validLines[0]?.number.trim() || null,
        direction: validLines[0]?.direction ?? 'charge',
        invoices: invoicesData,
      }
      const { error } = await supabase.from('supplier_debts').update(row).eq('id', editSupp.id)
      if (error) { showToast('שגיאה בעדכון', 'error'); setSsaving(false); return }
      showToast('עודכן ✓', 'success')
    } else {
      // New entry — bulk insert one independent row per line, each its own date/direction
      const rows = validLines.map(l => ({
        id: crypto.randomUUID(), tenant_id: tid,
        supplier_id: sSupplier || null,
        amount: parseFloat(l.amount) || 0,
        description: l.notes.trim() || sNotes.trim() || null,
        date: l.date,
        doc_type: l.type,
        doc_number: l.number.trim() || null,
        direction: l.direction,
        invoices: [],
        paid: 0,
        is_closed: l.direction === 'credit',
      }))
      const { error } = await supabase.from('supplier_debts').insert(rows)
      if (error) { showToast('שגיאה בשמירה', 'error'); setSsaving(false); return }
      showToast(`נשמרו ${rows.length} רשומות ✓`, 'success')
    }
    setSsaving(false); setShowSuppModal(false); setSelectedId(null); loadAll()
  }

  const deleteSuppDebt = async (id: string) => {
    if (!confirm('למחוק רשומה זו?')) return
    await supabase.from('supplier_debts').delete().eq('id', id)
    showToast('נמחק', 'success'); setSelectedId(null); loadAll()
  }

  const addDebtForSupplier = (suppId: string) => {
    setEditSupp(null); setSSupplier(suppId); setSNotes(''); setSInvoices([EMPTY_INV()])
    setShowSuppModal(true)
  }

  // ── Payment (one or several open debts of one supplier, in one action) ────

  const payOpenDebts = supplierDebts.filter(d => d.supplier_id === paySupplierId && !d.is_closed && d.direction === 'charge')
  const payDebtsByMonth = (() => {
    const map: Record<string, SupplierDebt[]> = {}
    payOpenDebts.forEach(d => {
      const mk = monthKeyOf(d.date)
      if (!map[mk]) map[mk] = []
      map[mk].push(d)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  })()
  const payTotalSelected = Array.from(paySelectedIds).reduce((s, id) => s + (parseFloat(payAllocAmounts[id] ?? '0') || 0), 0)

  const openPaySupplier = (supplierId: string | null, preselectId?: string) => {
    setPaySupplierId(supplierId)
    setPayMethod('מזומן'); setPayDate(todayISO())
    if (preselectId) {
      const d = supplierDebts.find(x => x.id === preselectId)
      setPaySelectedIds(new Set([preselectId]))
      setPayAllocAmounts(d ? { [preselectId]: String(bal(d).toFixed(2)) } : {})
    } else {
      setPaySelectedIds(new Set()); setPayAllocAmounts({})
    }
    setShowPayModal(true)
  }

  const togglePayDebt = (d: SupplierDebt) => {
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

    if (payMethod === "צ'ק") {
      setShowPayModal(false)
      setSchedInitialSupplierId(paySupplierId ?? undefined)
      setSchedModal(true)
      return
    }

    const allocations = Array.from(paySelectedIds)
      .map(id => ({ supplier_debt_id: id, amount: parseFloat(payAllocAmounts[id] ?? '0') || 0 }))
      .filter(a => a.amount > 0)
    if (allocations.length === 0) { showToast('סכום לא תקין', 'error'); return }

    setPaySaving(true)
    const { error } = await reconcileSupplierPayment(supabase, tid, allocations, null)
    if (error) { showToast('שגיאה בתשלום: ' + error, 'error'); setPaySaving(false); return }

    const total = allocations.reduce((s, a) => s + a.amount, 0)
    const suppName = suppliers.find(s => s.id === paySupplierId)?.name ?? 'ספק'
    await supabase.from('expenses').insert({
      tenant_id: tid, date: payDate, category: 'ספקים',
      description: `תשלום לספק ${suppName}`, amount: total,
      supplier_id: paySupplierId, payment_method: payMethod, payment_ref: null,
    })

    showToast('תשלום נרשם ✓', 'success')
    setPaySaving(false); setShowPayModal(false); loadAll()
  }

  const toggleClose = async (id: string, current: boolean) => {
    await supabase.from('supplier_debts').update({ is_closed: !current }).eq('id', id)
    loadAll()
  }

  // ── Retroactive allocation of an already-issued check/payment ─────────────

  const allocOpenDebts = supplierDebts.filter(d => d.supplier_id === allocatingPayment?.supplier_id && (allocShowClosed || !d.is_closed) && d.direction === 'charge')
  const allocDebtsByMonth = (() => {
    const map: Record<string, SupplierDebt[]> = {}
    allocOpenDebts.forEach(d => {
      const mk = monthKeyOf(d.date)
      if (!map[mk]) map[mk] = []
      map[mk].push(d)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  })()
  const allocTotalSelected = Array.from(allocSelectedIds).reduce((s, id) => s + (parseFloat(allocAmounts[id] ?? '0') || 0), 0)

  const openAllocatePayment = (p: ScheduledPayment) => {
    setAllocatingPayment(p); setAllocSelectedIds(new Set()); setAllocAmounts({}); setAllocShowClosed(false)
  }

  const ignoreAllocation = async (p: ScheduledPayment) => {
    if (!confirm('להתעלם מהצ׳ק הזה? הוא לא יוצג יותר כלא-משובץ.')) return
    await supabase.from('scheduled_payments').update({ allocation_ignored: true }).eq('id', p.id)
    loadAll()
  }

  const toggleAllocDebt = (d: SupplierDebt) => {
    setAllocSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(d.id)) {
        next.delete(d.id)
        setAllocAmounts(a => { const c = { ...a }; delete c[d.id]; return c })
      } else {
        next.add(d.id)
        const remaining = (allocatingPayment?.amount ?? 0) - allocTotalSelected
        setAllocAmounts(a => ({ ...a, [d.id]: a[d.id] ?? String(Math.max(0, Math.min(bal(d), remaining || bal(d))).toFixed(2)) }))
      }
      return next
    })
  }

  const submitAllocatePayment = async () => {
    if (!allocatingPayment) return
    if (allocSelectedIds.size === 0) { showToast('בחר לפחות שורה אחת', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return
    const allocations = Array.from(allocSelectedIds)
      .map(id => ({ supplier_debt_id: id, amount: parseFloat(allocAmounts[id] ?? '0') || 0 }))
      .filter(a => a.amount > 0)
    if (allocations.length === 0) { showToast('סכום לא תקין', 'error'); return }
    setAllocSaving(true)
    const { error } = await reconcileSupplierPayment(supabase, tid, allocations, allocatingPayment.id)
    if (error) { showToast('שגיאה בשיבוץ: ' + error, 'error'); setAllocSaving(false); return }
    showToast('שובץ ✓', 'success')
    setAllocSaving(false); setAllocatingPayment(null); loadAll()
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  const openSuppTotal = supplierDebts.filter(d => !d.is_closed).reduce((s, d) => s + bal(d), 0)

  // ── Selected item info ────────────────────────────────────────────────────

  const selectedSupp = selectedId ? supplierDebts.find(d => d.id === selectedId) : null

  // ── Sub-components ────────────────────────────────────────────────────────

  const TabBtn = ({ t, label, count }: { t: Tab; label: string; count?: number }) => (
    <button onClick={() => setTab(t)} style={{
      padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '13px', fontWeight: tab === t ? 600 : 400,
      color: tab === t ? 'var(--text)' : 'var(--text-muted)',
      background: tab === t ? '#fff' : 'transparent',
      borderRadius: '8px', whiteSpace: 'nowrap', flexShrink: 0,
      boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
      transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      {label}
      {count != null && count > 0 && (
        <span style={{
          background: tab === t ? '#dcfce7' : '#e2e8f0',
          color: tab === t ? '#15803d' : 'var(--text-muted)',
          borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700,
        }}>{count}</span>
      )}
    </button>
  )

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

  const StatusChip = ({ debt }: { debt: SupplierDebt }) => {
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
    if (tab === 'byMonth') {
      const rows = supplierDebts.map(d => ({
        ספק: suppliers.find(s => s.id === d.supplier_id)?.name ?? '', מספר: d.doc_number ?? '',
        סוג: d.direction === 'credit' ? 'זיכוי' : 'חיוב', סכום: d.amount, שולם: d.paid, יתרה: bal(d),
        תאריך: d.date, סטטוס: d.is_closed ? 'סגור' : 'פתוח', תיאור: d.description ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'חשבוניות וזיכויים')
    } else {
      const rows = scheduledPayments.filter(p => !p.is_paid).map(p => ({
        ספק: suppliers.find(s => s.id === p.supplier_id)?.name ?? '', תיאור: p.description, סכום: p.amount,
        'תאריך פירעון': p.due_date, אמצעי: p.payment_method === 'check' ? "צ'ק" : 'העברה', 'מספר צ׳ק': p.check_number ?? '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'יומן צ׳קים')
    }
    XLSX.writeFile(wb, 'מעקב-ספקים.xlsx')
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
      const suppName = String(r['ספק'] ?? '').trim()
      const supplier = suppName ? suppliers.find(s => s.name === suppName) : undefined
      const direction: Direction = String(r['סוג'] ?? '').includes('זיכוי') ? 'credit' : 'charge'
      const amount = parseFloat(String(r['סכום'] ?? '')) || 0
      const paid   = direction === 'credit' ? 0 : (parseFloat(String(r['שולם'] ?? '')) || 0)
      const isClosed = direction === 'credit' || String(r['סטטוס'] ?? '').includes('סגור') || paid >= amount && amount > 0
      return {
        id: crypto.randomUUID(), tenant_id: tid,
        supplier_id: supplier?.id ?? null,
        amount, paid, direction, is_closed: isClosed,
        date: parseDate(r['תאריך']),
        doc_type: 'invoice', doc_number: String(r['מספר'] ?? '').trim() || null,
        description: String(r['תיאור'] ?? '').trim() || null,
        invoices: [],
      }
    }).filter(r => r.amount > 0)

    if (!toInsert.length) { showToast('לא נמצאו שורות תקינות (חסר סכום)', 'error'); return }
    const { error } = await supabase.from('supplier_debts').insert(toInsert)
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
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
        iconBg="linear-gradient(135deg,#0369a1,#38bdf8)"
        iconShadow="#0369a144"
        title="מעקב ספקים"
        subtitle="חשבוניות, זיכויים, ושיבוץ צ'קים לפי חודש"
      />

      {/* Tabs */}
      <div className="scroll-x" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          <TabBtn t="byMonth"  label="🏭 לפי ספק" />
          <TabBtn t="calendar" label="📅 יומן צ׳קים" count={scheduledPayments.filter(p => !p.is_paid).length} />
        </div>
      </div>

      {/* ── BY-MONTH TAB ── */}
      {tab === 'byMonth' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: selectedId ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => openSuppModal()}>+ הוסף חשבונית/זיכוי</Button>
            <Button variant="secondary" onClick={() => setSchedModal(true)}>📝 צ׳ק / סדרה לספק</Button>
            <div style={{ display: 'flex', gap: '6px' }}>
              <FilterBtn f="open" label="פתוחים" />
              <FilterBtn f="closed" label="סגורים" />
              <FilterBtn f="all" label="הכל" />
            </div>
            <input
              placeholder="חיפוש ספק / תיאור..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
            />
            <span style={{ marginRight: 'auto', fontSize: '13px', color: 'var(--text-muted)' }}>
              יתרה כוללת: <strong style={{ color: 'var(--danger)' }}>{fmt(openSuppTotal)}</strong>
            </span>
            <Button variant="secondary" onClick={() => setShowPrintChoice(true)}>🖨️ הדפסה</Button>
            <ExcelMenu onExportExcel={exportExcel} onImportExcel={importExcel} />
          </div>

          {/* Selection action bar */}
          {selectedId && selectedSupp && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: 600 }}>✓ שורה נבחרה</span>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
                {suppliers.find(s => s.id === selectedSupp.supplier_id)?.name ?? 'ללא ספק'} · <strong>{fmt(bal(selectedSupp))}</strong>
              </span>
              {suppliers.find(s => s.id === selectedSupp.supplier_id)?.phone && (
                <button
                  onClick={() => {
                    const supp = suppliers.find(s => s.id === selectedSupp.supplier_id)!
                    setWaModal({ phone: supp.phone!, text: `שלום ${supp.name}, ברצוני לבדוק חוב בסך ${fmt(bal(selectedSupp))}.\nתודה!\n${tenantName}` })
                  }}
                  style={{ padding: '5px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >💬 ווצאפ</button>
              )}
              {!selectedSupp.is_closed && bal(selectedSupp) > 0 && selectedSupp.direction === 'charge' && (
                <button onClick={() => openPaySupplier(selectedSupp.supplier_id, selectedId)} style={{ padding: '5px 12px', background: '#f0fdf6', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>₪ שלם</button>
              )}
              <button onClick={() => toggleClose(selectedId, selectedSupp.is_closed)} style={{ padding: '5px 10px', background: selectedSupp.is_closed ? '#fef2f2' : '#f0fdf6', color: selectedSupp.is_closed ? 'var(--danger)' : '#16a34a', border: '1px solid', borderColor: selectedSupp.is_closed ? '#fecaca' : '#bbf7d0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>{selectedSupp.is_closed ? '↩ פתח' : '✓ סגור'}</button>
              <button onClick={() => openSuppModal(selectedSupp)} style={{ padding: '5px 10px', background: '#f0f9ff', color: 'var(--accent)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>✏️ ערוך</button>
              <button onClick={() => deleteSuppDebt(selectedId)} style={{ padding: '5px 10px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>🗑 מחק</button>
              <button onClick={() => setSelectedId(null)} style={{ padding: '5px 8px', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {(() => {
            const allSuppIds = [...new Set(supplierDebts.map(d => d.supplier_id))]
            const groups = allSuppIds.map(sid => {
              const debts = supplierDebts.filter(d => d.supplier_id === sid)
              const supp = suppliers.find(s => s.id === sid)
              const totalBal = debts.reduce((s, d) => s + bal(d), 0)

              if (search.trim()) {
                const q = search.toLowerCase()
                const nameMatch = (supp?.name ?? '').toLowerCase().includes(q)
                const descMatch = debts.some(d => d.description?.toLowerCase().includes(q))
                if (!nameMatch && !descMatch) return null
              }
              if (filter === 'open'   && totalBal === 0) return null
              if (filter === 'closed' && totalBal > 0)  return null

              const monthMap: Record<string, SupplierDebt[]> = {}
              debts.forEach(d => {
                const mk = monthKeyOf(d.date)
                if (!monthMap[mk]) monthMap[mk] = []
                monthMap[mk].push(d)
              })
              const months = Object.keys(monthMap).sort().reverse()
              const suppPayments = scheduledPayments.filter(p => p.supplier_id === sid)

              const debtIds = new Set(debts.map(d => d.id))
              const linkedIds = new Set(
                debtPayments.filter(dp => debtIds.has(dp.supplier_debt_id) && dp.scheduled_payment_id)
                  .map(dp => dp.scheduled_payment_id!)
              )
              const unlinkedPayments = suppPayments.filter(p => !p.is_paid && !p.allocation_ignored && !linkedIds.has(p.id))

              return { sid, supp, totalBal, monthMap, months, suppPayments, unlinkedPayments }
            }).filter(Boolean) as {
              sid: string | null; supp: Supplier | undefined; totalBal: number
              monthMap: Record<string, SupplierDebt[]>; months: string[]
              suppPayments: ScheduledPayment[]; unlinkedPayments: ScheduledPayment[]
            }[]

            if (groups.length === 0) return (
              <EmptyState icon="🏭" text={`אין רשומות ${filter === 'open' ? 'פתוחות' : filter === 'closed' ? 'סגורות' : ''}`} />
            )

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groups.map(group => {
                  const isOpen = openSupplierKeys.has(supplierKeyOf(group.sid))
                  return (
                  <div key={group.sid ?? 'none'} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

                    <div
                      onClick={() => toggleSupplierOpen(group.sid)}
                      style={{ background: '#f1f5f9', borderBottom: isOpen ? '2px solid var(--border)' : 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', cursor: 'pointer' }}
                    >
                      <span style={{ display: 'inline-block', transition: 'transform .15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--text-muted)' }}>›</span>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>🏭 {group.supp?.name ?? 'ללא ספק'}</span>
                      {group.supp?.phone && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{group.supp.phone}</span>}
                      <span style={{ marginRight: 'auto', fontSize: '14px', fontWeight: 700, color: group.totalBal > 0 ? 'var(--danger)' : '#16a34a' }}>
                        יתרה כוללת: {fmt(group.totalBal)}
                      </span>
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '6px' }}>
                        {group.totalBal > 0 && (
                          <button onClick={() => openPaySupplier(group.sid)}
                            style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                            💰 תשלום
                          </button>
                        )}
                        {group.sid && (
                          <button onClick={() => addDebtForSupplier(group.sid!)}
                            style={{ padding: '4px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                            + הוסף
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                    <>

                    {group.unlinkedPayments.length > 0 && (
                      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 16px', fontSize: '12px', color: '#92400e' }}>
                        <div>⚠ {group.unlinkedPayments.length} צ׳קים/תשלומים לספק זה טרם שובצו מול חוב — לחץ לשיבוץ רטרואקטיבי:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {group.unlinkedPayments.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <button onClick={() => openAllocatePayment(p)}
                                style={{ padding: '3px 10px', background: '#fff', border: '1px solid #fde68a', borderRadius: '6px 0 0 6px', fontSize: '11px', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                                {fmt(p.amount)} ({p.due_date}) →
                              </button>
                              <button onClick={() => ignoreAllocation(p)} title="התעלם מהצ׳ק הזה"
                                style={{ padding: '3px 8px', background: '#fff', border: '1px solid #fde68a', borderLeft: 'none', borderRadius: '0 6px 6px 0', fontSize: '11px', cursor: 'pointer', color: '#92400e' }}>
                                ✕ התעלם
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {group.months.map((mk, mIdx) => {
                      const monthDebts = group.monthMap[mk]
                      const carryOver = group.months.slice(mIdx + 1).reduce(
                        (s, m) => s + group.monthMap[m].reduce((ss, d) => ss + bal(d), 0), 0)
                      const monthDebtIds = new Set(monthDebts.map(d => d.id))
                      const linkedPaymentIds = new Set(
                        debtPayments.filter(dp => monthDebtIds.has(dp.supplier_debt_id) && dp.scheduled_payment_id)
                          .map(dp => dp.scheduled_payment_id!)
                      )
                      const monthPayments = group.suppPayments.filter(p => linkedPaymentIds.has(p.id))
                      const monthChargeTotal = monthDebts.filter(d => d.direction !== 'credit').reduce((s, d) => s + Number(d.amount), 0)
                      const monthCreditTotal = monthDebts.filter(d => d.direction === 'credit').reduce((s, d) => s + Number(d.amount), 0)
                      const monthNetTotal    = monthChargeTotal - monthCreditTotal
                      const monthPaidTotal   = monthDebts.reduce((s, d) => s + Number(d.paid), 0)
                      const monthBalance     = monthDebts.reduce((s, d) => s + bal(d), 0)
                      const monthCollapsed   = !expandedMonthKeys.has(monthKeyFor(group.sid, mk))

                      return (
                        <div key={mk} style={{ borderBottom: mIdx < group.months.length - 1 ? '1px solid var(--border)' : 'none', padding: '14px 16px' }}>

                          <div
                            onClick={() => toggleMonthCollapsed(group.sid, mk)}
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
                                        onClick={e => { e.stopPropagation(); openSuppModal(d) }}
                                        title="ערוך"
                                        style={{ padding: '3px 6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
                                      >✏️</button>
                                      <button
                                        onClick={e => { e.stopPropagation(); deleteSuppDebt(d.id) }}
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

                          {!monthCollapsed && monthPayments.length > 0 && (
                            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', marginBottom: '7px' }}>📅 תשלומים מתוזמנים:</div>
                              {monthPayments.map((p, pi) => {
                                const days = daysUntilDate(p.due_date)
                                return (
                                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', fontSize: '13px', borderTop: pi > 0 ? '1px solid #e0f2fe' : 'none', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                      {p.payment_method === 'check' ? "צ'ק" : 'העברה'}{p.check_number ? ` #${p.check_number}` : ''}
                                    </span>
                                    {p.description && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.description}</span>}
                                    <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{p.due_date}</span>
                                    <span style={{ marginRight: 'auto' }}>
                                      {p.is_paid
                                        ? <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>✓ שולם</span>
                                        : <span style={{ fontSize: '11px', fontWeight: 600, color: days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : '#2563eb' }}>
                                            {days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'היום!' : `עוד ${days} ימים`}
                                          </span>}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
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
      )}

      {/* ── CHECKS CALENDAR TAB ── */}
      {tab === 'calendar' && (() => {
        const upcoming = scheduledPayments.filter(p => !p.is_paid).sort((a, b) => a.due_date.localeCompare(b.due_date))
        const monthGroups: Record<string, ScheduledPayment[]> = {}
        upcoming.forEach(p => {
          const mk = monthKeyOf(p.due_date)
          if (!monthGroups[mk]) monthGroups[mk] = []
          monthGroups[mk].push(p)
        })
        const months = Object.keys(monthGroups).sort()
        const grandTotal = upcoming.reduce((s, p) => s + Number(p.amount), 0)

        return (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <Button variant="secondary" onClick={() => setSchedModal(true)}>📝 צ׳ק / סדרה לספק</Button>
              <ExcelMenu onExportExcel={exportExcel} />
            </div>
            {upcoming.length === 0 ? (
              <EmptyState icon="📅" text="אין צ׳קים או תשלומים עתידיים" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>סה״כ עתידי לתשלום — כל הספקים</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--danger)' }}>{fmt(grandTotal)}</span>
                </div>
                {months.map(mk => {
                  const items = monthGroups[mk]
                  const monthTotal = items.reduce((s, p) => s + Number(p.amount), 0)
                  return (
                    <div key={mk} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                      <div style={{ background: '#f1f5f9', borderBottom: '2px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#1d4ed8' }}>{fmtMonth(mk)}</span>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{fmt(monthTotal)}</span>
                      </div>
                      <div>
                        {items.map((p, i) => {
                          const days = daysUntilDate(p.due_date)
                          const supName = suppliers.find(s => s.id === p.supplier_id)?.name
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', background: p.payment_method === 'check' ? '#fef9c3' : '#eff6ff', color: p.payment_method === 'check' ? '#92400e' : '#1d4ed8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                {p.payment_method === 'check' ? "צ'ק" : 'העברה'}{p.check_number ? ` #${p.check_number}` : ''}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: '90px' }}>{supName ?? '—'}</span>
                              <span style={{ fontSize: '13px', flex: 1 }}>{p.description}</span>
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.due_date}</span>
                              <span style={{ fontWeight: 700, minWidth: '90px', textAlign: 'left' }}>{fmt(p.amount)}</span>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : '#2563eb', whiteSpace: 'nowrap' }}>
                                {days < 0 ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? 'היום!' : `עוד ${days} ימים`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── SUPPLIER DEBT MODAL ── */}
      {showSuppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSuppModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '620px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editSupp ? '✏️ עריכת רשומה' : '+ חשבונית/זיכוי חדש'}</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>ספק</span>
                  <button type="button" onClick={() => setShowQuickAddSupplier(true)} style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>+ הוסף ספק חדש</button>
                </div>
                <select value={sSupplier} onChange={e => setSSupplier(e.target.value)} className="form-input">
                  <option value="">— ללא ספק ספציפי —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>חשבוניות / זיכויים</span>
                  {!editSupp && (
                    <button type="button" onClick={addInvoiceLine} style={{ padding: '4px 10px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>+ הוסף שורה</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sInvoices.map((inv, i) => (
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
                        {!editSupp && (
                          <button type="button" onClick={() => removeInvoiceLine(i)} disabled={sInvoices.length === 1}
                            style={{ padding: '4px 8px', background: '#fef2f2', color: 'var(--danger)', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '13px', cursor: sInvoices.length === 1 ? 'default' : 'pointer', opacity: sInvoices.length === 1 ? 0.4 : 1 }}
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
                {!editSupp && sInvoices.length > 1 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>כל שורה תישמר כרשומה עצמאית משלה, עם התאריך והסוג שבחרת.</div>
                )}
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600 }}>
                הערות (אופציונלי)
                <input value={sNotes} onChange={e => setSNotes(e.target.value)} placeholder="פירוט נוסף..." className="form-input" />
              </label>
            </div>
            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowSuppModal(false)}>ביטול</Button>
              <Button loading={sSaving} onClick={saveSuppDebt}>💾 שמור</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL — pick one or several open debts + payment method ── */}
      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPayModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>₪ תשלום ל{suppliers.find(s => s.id === paySupplierId)?.name ?? 'ספק'}</h3>

            {payOpenDebts.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין חובות פתוחים לספק זה</div>
            ) : (
              <>
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
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>ייפתח מודל יצירת צ׳ק/סדרה, מסונן מראש לספק זה.</div>
                  )}
                </div>

                {payMethod !== "צ'ק" && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600, marginTop: '12px' }}>
                    תאריך תשלום
                    <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="form-input" />
                  </label>
                )}
              </>
            )}

            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setShowPayModal(false)}>ביטול</Button>
              {payOpenDebts.length > 0 && (
                <Button loading={paySaving} onClick={submitPayment} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  {payMethod === "צ'ק" ? 'המשך לצ׳ק ←' : '✓ אשר תשלום'}
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

      {/* ── ALLOCATE EXISTING CHECK/PAYMENT MODAL (retroactive) ── */}
      {allocatingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAllocatingPayment(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '480px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>שיבוץ תשלום מול חובות</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {allocatingPayment.payment_method === 'check' ? "צ'ק" : 'העברה'}{allocatingPayment.check_number ? ` #${allocatingPayment.check_number}` : ''} · <strong>{fmt(allocatingPayment.amount)}</strong> · {allocatingPayment.due_date}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={allocShowClosed} onChange={e => setAllocShowClosed(e.target.checked)} />
              הצג גם חובות סגורים
            </label>

            {allocOpenDebts.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>אין חובות {allocShowClosed ? '' : 'פתוחים '}לספק זה</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                  {allocDebtsByMonth.map(([mk, debts]) => (
                    <div key={mk} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>{fmtMonth(mk)}</div>
                      {debts.map(d => {
                        const checked = allocSelectedIds.has(d.id)
                        return (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleAllocDebt(d)} />
                            <span style={{ fontSize: 12, flex: 1, color: 'var(--text-muted)' }}>
                              {d.doc_number ? `#${d.doc_number} · ` : ''}{d.date} · יתרה {fmt(bal(d))}
                              {d.is_closed && (
                                <span style={{ marginRight: 6, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#16a34a' }}>✓ סגור</span>
                              )}
                            </span>
                            {checked && (
                              <input
                                type="number" step="0.01"
                                value={allocAmounts[d.id] ?? ''}
                                onChange={e => setAllocAmounts(a => ({ ...a, [d.id]: e.target.value }))}
                                style={{ width: 90, padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, color: Math.abs(allocTotalSelected - allocatingPayment.amount) > 0.01 ? 'var(--warning)' : 'var(--text-muted)' }}>
                  סה&quot;כ משובץ: {fmt(allocTotalSelected)} מתוך {fmt(allocatingPayment.amount)}
                </div>
              </>
            )}

            <div className="sticky-actions">
              <Button variant="secondary" onClick={() => setAllocatingPayment(null)}>ביטול</Button>
              {allocOpenDebts.length > 0 && (
                <Button loading={allocSaving} onClick={submitAllocatePayment}>✓ שבץ</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULED PAYMENTS (CHECKS) MODAL ── */}
      {tenantIdRef.current && (
        <ScheduledPaymentsModal
          open={schedModal}
          onClose={() => { setSchedModal(false); setSchedInitialSupplierId(undefined) }}
          suppliers={suppliers}
          tenantId={tenantIdRef.current}
          supabase={supabase}
          onRefresh={loadAll}
          showToast={showToast}
          expenseCats={expenseCats}
          initialSupplierId={schedInitialSupplierId}
        />
      )}

      <QuickAddSupplierModal
        open={showQuickAddSupplier}
        onClose={() => setShowQuickAddSupplier(false)}
        tenantId={tenantIdRef.current ?? ''}
        supabase={supabase}
        showToast={showToast}
        onCreated={(s: QuickSupplier) => {
          setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name, 'he')))
          setSSupplier(s.id)
        }}
      />

      {/* ── PRINT CHOICE MODAL ── */}
      {showPrintChoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPrintChoice(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '420px', width: '100%', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 700 }}>🖨️ מה להדפיס?</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>כרטסת ספק (חשבוניות/זיכויים + מאזן)</div>
                <select
                  value={printSupplierId}
                  onChange={e => { setPrintSupplierId(e.target.value); setPrintMonths(new Set()); setPrintDateFrom(''); setPrintDateTo('') }}
                  className="form-input" style={{ marginBottom: '8px' }}
                >
                  <option value="">בחר ספק...</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {printSupplierId && (
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
                        {printSupplierMonths.length === 0
                          ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>אין רשומות לספק זה</span>
                          : printSupplierMonths.map(mk => (
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
                  disabled={!printSupplierId || (printRangeMode === 'months' && printMonths.size === 0)}
                  style={{ width: '100%' }}
                >🖨️ הדפס כרטסת</Button>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>יומן צ׳קים עתידי (כל הספקים)</div>
                <Button
                  variant="secondary"
                  onClick={() => { setShowPrintChoice(false); setPrintMode('calendar') }}
                  style={{ width: '100%' }}
                >🖨️ הדפס יומן צ׳קים</Button>
              </div>
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
              #print-area, #print-area * { visibility: visible; }
              #print-area { display: block !important; position: absolute; top: 0; right: 0; width: 100%; padding: 24px; direction: rtl; }
              #print-area table { width: 100%; border-collapse: collapse; font-size: 13px; }
              #print-area th, #print-area td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
              #print-area th { background: #eee; }
            }
          `}</style>

          {printMode === 'ledger' && (() => {
            const supp = suppliers.find(s => s.id === printSupplierId)
            const allDebts = supplierDebts.filter(d => d.supplier_id === printSupplierId).sort((a, b) => a.date.localeCompare(b.date))

            const sortedPrintMonths = [...printMonths].sort()
            const rangeStart = printRangeMode === 'months' && sortedPrintMonths.length > 0
              ? `${sortedPrintMonths[0]}-01`
              : printRangeMode === 'range' ? (printDateFrom || null) : null

            const inRange = (d: SupplierDebt) => {
              if (printRangeMode === 'months') return sortedPrintMonths.length === 0 || printMonths.has(monthKeyOf(d.date))
              if (printRangeMode === 'range') return (!printDateFrom || d.date >= printDateFrom) && (!printDateTo || d.date <= printDateTo)
              return true
            }

            const debts = allDebts.filter(inRange)
            const priorDebts = rangeStart ? allDebts.filter(d => d.date < rangeStart) : []
            const openingForReport = (supp?.opening_balance ?? 0) + priorDebts.reduce((s, d) => s + bal(d), 0)

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
                <h2 style={{ margin: '0 0 4px' }}>{tenantName} — כרטסת ספק: {supp?.name ?? ''}</h2>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>תקופה: {rangeLabel}</div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>תאריך הדפסה: {new Date().toLocaleDateString('he-IL')}</div>
                <table>
                  <thead><tr><th>תאריך</th><th>מספר</th><th>סוג</th><th>סכום</th><th>יתרה בפועל</th></tr></thead>
                  <tbody>
                    {showOpeningRow && (
                      <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                        <td>—</td>
                        <td>—</td>
                        <td>יתרת פתיחה</td>
                        <td>—</td>
                        <td>{fmt(openingForReport)}</td>
                      </tr>
                    )}
                    {debts.flatMap(d => {
                      const items = Array.isArray(d.invoices) && d.invoices.length > 0 ? d.invoices : [{ number: d.doc_number ?? '', amount: Number(d.amount) }]
                      return items.map((item, idx) => {
                        running += d.direction === 'credit' ? -Number(item.amount) : Number(item.amount)
                        return (
                          <tr key={`${d.id}-${idx}`}>
                            <td>{d.date}</td>
                            <td>{item.number || '—'}</td>
                            <td style={{ textAlign: d.direction === 'credit' ? 'left' : 'right' }}>{d.direction === 'credit' ? 'זיכוי' : 'חיוב'}</td>
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

          {printMode === 'calendar' && (() => {
            const upcoming = scheduledPayments.filter(p => !p.is_paid).sort((a, b) => a.due_date.localeCompare(b.due_date))
            const total = upcoming.reduce((s, p) => s + Number(p.amount), 0)
            return (
              <div>
                <h2 style={{ margin: '0 0 4px' }}>{tenantName} — יומן צ׳קים עתידי</h2>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>תאריך הדפסה: {new Date().toLocaleDateString('he-IL')}</div>
                <table>
                  <thead><tr><th>ספק</th><th>תיאור</th><th>תאריך פירעון</th><th>מספר צ׳ק</th><th>סכום</th></tr></thead>
                  <tbody>
                    {upcoming.map(p => (
                      <tr key={p.id}>
                        <td>{suppliers.find(s => s.id === p.supplier_id)?.name ?? '—'}</td>
                        <td>{p.description}</td>
                        <td>{p.due_date}</td>
                        <td>{p.check_number ?? ''}</td>
                        <td>{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>סה&quot;כ: {fmt(total)}</div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
