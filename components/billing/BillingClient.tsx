'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// ── Types ──────────────────────────────────────────────────────────────────

interface BillingContact {
  id: string; tenant_id: string
  name: string
  role: string
  default_direction: 'expense' | 'income'
  phone: string | null
  notes: string | null
  active: boolean
  created_at: string
}

interface BillingItem {
  id: string; tenant_id: string
  name: string
  contact_id: string | null
  contact_name: string | null
  direction: 'expense' | 'income'
  type: 'fixed' | 'meter'
  amount: number | null
  price_per_unit: number | null
  valid_from: string
  active: boolean
  created_at: string
}

interface EntryPayment {
  id: string; amount: number; paid_date: string; notes: string | null; created_at: string
}

interface BillingEntry {
  id: string; tenant_id: string
  billing_item_id: string | null
  contact_id: string | null
  month: string
  direction: 'expense' | 'income'
  name: string
  amount: number
  meter_prev: number | null
  meter_curr: number | null
  price_per_unit: number | null
  notes: string | null
  created_at: string
  payments: EntryPayment[]
}

type Tab = 'monthly' | 'items' | 'contacts' | 'summary'

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt      = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayISO = () => new Date().toISOString().slice(0, 10)
const monthISO = () => new Date().toISOString().slice(0, 7)

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  const names = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
  return `${names[parseInt(mo) - 1]} ${y}`
}
const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
}
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}

const paidTotal = (e: BillingEntry) => e.payments.reduce((s, p) => s + Number(p.amount), 0)
const balance   = (e: BillingEntry) => Number(e.amount) - paidTotal(e)
const entryStatus = (e: BillingEntry): 'paid' | 'partial' | 'pending' => {
  const paid = paidTotal(e)
  if (paid <= 0)                    return 'pending'
  if (paid >= Number(e.amount))     return 'paid'
  return 'partial'
}
const statusBadge = (e: BillingEntry) => {
  const s = entryStatus(e)
  if (s === 'paid')    return { label: '✓ שולם',       color: 'var(--primary)', bg: '#f0fdf4' }
  if (s === 'partial') return { label: '◑ שולם חלקית', color: 'var(--warning)', bg: '#fffbeb' }
  return                        { label: '○ ממתין',      color: 'var(--text-muted)', bg: '#f8fafc' }
}

const ROLE_LABELS: Record<string, string> = {
  landlord:  'משכיר',
  tenant:    'שוכר',
  supplier:  'ספק',
  authority: 'רשות / עירייה',
  other:     'אחר',
}
const ROLE_DEFAULT_DIR: Record<string, 'expense' | 'income'> = {
  landlord:  'expense',
  tenant:    'income',
  supplier:  'expense',
  authority: 'expense',
  other:     'expense',
}

// ── VAT ────────────────────────────────────────────────────────────────────
const VAT_RATE   = 0.18
const withVat    = (n: number) => n * (1 + VAT_RATE)
const withoutVat = (n: number) => n / (1 + VAT_RATE)

function UnitToggle({ unit, onChange }: { unit: 'ils' | 'agorot'; onChange: (v: 'ils' | 'agorot') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
      {(['ils', 'agorot'] as const).map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: unit === v ? '#2563eb' : 'transparent',
          color: unit === v ? '#fff' : 'var(--text-muted)',
          fontWeight: unit === v ? 600 : 400,
        }}>
          {v === 'ils' ? '₪' : 'אג\''}
        </button>
      ))}
    </div>
  )
}

function VatToggle({ mode, onChange }: { mode: 'before' | 'after'; onChange: (v: 'before' | 'after') => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
      {(['after', 'before'] as const).map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          background: mode === v ? 'var(--primary)' : 'transparent',
          color: mode === v ? '#fff' : 'var(--text-muted)',
          fontWeight: mode === v ? 600 : 400,
        }}>
          {v === 'after' ? 'כולל מע"מ' : 'לפני מע"מ'}
        </button>
      ))}
    </div>
  )
}

// ── Shared styles (table + select) ─────────────────────────────────────────
const thSt: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontWeight: 600,
  color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap',
}
const tdSt: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', verticalAlign: 'middle' }
const selSt: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '14px', background: '#fff', color: 'var(--text)', fontFamily: 'inherit', width: '100%',
}
const labelSt: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }

// ── Component ──────────────────────────────────────────────────────────────

export default function BillingClient() {
  const supabase      = useRef(createClient()).current
  const tenantIdRef   = useRef<string | null>(null)
  const { showToast } = useToast()
  const { confirm }   = useConfirm()

  const [tab, setTab]             = useState<Tab>('monthly')
  const [currentMonth, setMonth]  = useState(monthISO)
  const [editMode, setEditMode]   = useState(false)
  const [itemsEdit, setItemsEdit] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [dirFilter,     setDirFilter]     = useState<'all' | 'expense' | 'income'>('all')
  const [contactFilter, setContactFilter] = useState('')

  const [contacts, setContacts] = useState<BillingContact[]>([])
  const [items,    setItems]    = useState<BillingItem[]>([])
  const [entries,  setEntries]  = useState<BillingEntry[]>([])

  // ── Payment modal ──────────────────────────────────────────────────────
  const [payEntry,  setPayEntry]  = useState<BillingEntry | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate,   setPayDate]   = useState(todayISO)
  const [payNotes,  setPayNotes]  = useState('')
  const [payMethod, setPayMethod] = useState('מזומן')

  // ── Contact modal ──────────────────────────────────────────────────────
  const [showContactModal, setShowContactModal] = useState(false)
  const [editContact, setEditContact] = useState<BillingContact | null>(null)
  const [coName,  setCoName]  = useState('')
  const [coRole,  setCoRole]  = useState('landlord')
  const [coDir,   setCoDir]   = useState<'expense' | 'income'>('expense')
  const [coPhone, setCoPhone] = useState('')
  const [coNotes, setCoNotes] = useState('')

  // ── Item modal ─────────────────────────────────────────────────────────
  const [showItemModal, setShowItemModal] = useState(false)
  const [editItem,      setEditItem]      = useState<BillingItem | null>(null)
  const [iName,    setIName]    = useState('')
  const [iContact, setIContact] = useState('')
  const [iDir,     setIDir]     = useState<'expense' | 'income'>('expense')
  const [iType,    setIType]    = useState<'fixed' | 'meter'>('fixed')
  const [iAmt,     setIAmt]     = useState('')
  const [iPpu,     setIPpu]     = useState('')
  const [iFrom,    setIFrom]    = useState(monthISO)
  const [iActive,  setIActive]  = useState(true)
  const [iVat,     setIVat]     = useState<'before' | 'after'>('after')
  const [iPpuUnit, setIPpuUnit] = useState<'ils' | 'agorot'>('ils')

  // ── Entry modal ────────────────────────────────────────────────────────
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [editEntry,      setEditEntry]      = useState<BillingEntry | null>(null)
  const [eName,    setEName]    = useState('')
  const [eContact, setEContact] = useState('')
  const [eDir,     setEDir]     = useState<'expense' | 'income'>('expense')
  const [eAmt,     setEAmt]     = useState('')
  const [ePrev,    setEPrev]    = useState('')
  const [eCurr,    setECurr]    = useState('')
  const [ePpu,     setEPpu]     = useState('')
  const [eType,    setEType]    = useState<'fixed' | 'meter'>('fixed')
  const [eNotes,   setENotes]   = useState('')
  const [eVat,     setEVat]     = useState<'before' | 'after'>('after')
  const [ePpuUnit, setEPpuUnit] = useState<'ils' | 'agorot'>('ils')

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      tenantIdRef.current = profile.tenant_id
      await Promise.all([loadContacts(), loadItems(), loadEntries(monthISO())])
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Data loaders ───────────────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from('billing_contacts').select('*').order('created_at')
    setContacts(data ?? [])
  }, [supabase])

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from('billing_items').select('*').order('created_at')
    setItems(data ?? [])
  }, [supabase])

  const loadEntries = useCallback(async (month: string) => {
    const { data } = await supabase
      .from('billing_entries')
      .select('*, payments:billing_entry_payments(id, amount, paid_date, notes, created_at)')
      .eq('month', month)
      .order('created_at')
    setEntries((data ?? []) as BillingEntry[])
  }, [supabase])

  const changeMonth = async (m: string) => {
    setMonth(m); setLoading(true)
    await loadEntries(m)
    setLoading(false)
  }

  // ── Derived ────────────────────────────────────────────────────────────

  const contactById = (id: string | null) => contacts.find(c => c.id === id) ?? null

  const entryContactObj = (e: BillingEntry): BillingContact | null => {
    if (e.contact_id) return contactById(e.contact_id)
    if (e.billing_item_id) {
      const item = items.find(it => it.id === e.billing_item_id)
      if (item?.contact_id) return contactById(item.contact_id)
    }
    return null
  }

  const allContactsInMonth = [...new Map(
    entries.map(e => entryContactObj(e)).filter(Boolean).map(c => [c!.id, c!])
  ).values()]

  const visibleEntries = entries.filter(e => {
    if (dirFilter !== 'all' && e.direction !== dirFilter) return false
    if (contactFilter) {
      const c = entryContactObj(e)
      if (!c || c.id !== contactFilter) return false
    }
    return true
  })

  const totalExpenses = entries.filter(e => e.direction === 'expense').reduce((s, e) => s + Number(e.amount), 0)
  const totalIncome   = entries.filter(e => e.direction === 'income').reduce((s, e) => s + Number(e.amount), 0)
  const totalPaidExp  = entries.filter(e => e.direction === 'expense').reduce((s, e) => s + paidTotal(e), 0)
  const totalPaidInc  = entries.filter(e => e.direction === 'income').reduce((s, e) => s + paidTotal(e), 0)

  // ── Generate entries ───────────────────────────────────────────────────

  const generateEntries = async () => {
    const tid = tenantIdRef.current
    if (!tid) return
    setSaving(true)
    try {
      const active = items.filter(it => it.active && it.valid_from <= currentMonth)
      const best = new Map<string, BillingItem>()
      for (const it of active) {
        const key = `${it.name}__${it.direction}`
        const prev = best.get(key)
        if (!prev || it.valid_from > prev.valid_from) best.set(key, it)
      }
      const existing = new Set(entries.map(e => e.billing_item_id))
      const toCreate = [...best.values()].filter(it => !existing.has(it.id))
      if (!toCreate.length) { showToast('כל הסעיפים כבר קיימים לחודש זה', 'error'); setSaving(false); return }

      const rows = toCreate.map(it => ({
        tenant_id:        tid,
        billing_item_id:  it.id,
        contact_id:       it.contact_id,
        month:            currentMonth,
        direction:        it.direction,
        name:             it.name,
        amount:           it.type === 'fixed' ? (it.amount ?? 0) : 0,
        price_per_unit:   it.price_per_unit,
      }))
      const { error } = await supabase.from('billing_entries').insert(rows)
      if (error) throw error
      await loadEntries(currentMonth)
      showToast(`נוצרו ${rows.length} רשומות`, 'success')
    } catch { showToast('שגיאה ביצירת רשומות', 'error') }
    setSaving(false)
  }

  // ── Sync payment → ledger ──────────────────────────────────────────────

  const syncToLedger = async (list: { entry: BillingEntry; amount: number }[]) => {
    const tid = tenantIdRef.current
    if (!tid) return
    const expenses = list.filter(x => x.entry.direction === 'expense').map(x => ({
      tenant_id: tid, date: todayISO(), category: 'חשבונות',
      description: x.entry.name, amount: x.amount, payment_method: payMethod,
    }))
    const incomes = list.filter(x => x.entry.direction === 'income').map(x => ({
      tenant_id: tid, date: todayISO(), category: 'חשבונות',
      description: x.entry.name, amount: x.amount,
    }))
    if (expenses.length) await supabase.from('expenses').insert(expenses)
    if (incomes.length)  await supabase.from('income').insert(incomes)
  }

  // ── Pay all ────────────────────────────────────────────────────────────

  const payAll = async () => {
    const tid = tenantIdRef.current
    if (!tid) return
    const pending = visibleEntries.filter(e => balance(e) > 0)
    if (!pending.length) { showToast('אין רשומות ממתינות', 'error'); return }
    setSaving(true)
    try {
      const payments = pending.map(e => ({
        tenant_id: tid, entry_id: e.id, amount: balance(e), paid_date: todayISO(),
      }))
      const { error } = await supabase.from('billing_entry_payments').insert(payments)
      if (error) throw error
      await syncToLedger(pending.map((e, i) => ({ entry: e, amount: payments[i].amount })))
      await loadEntries(currentMonth)
      showToast('כל הרשומות סומנו כשולמו', 'success')
    } catch { showToast('שגיאה', 'error') }
    setSaving(false)
  }

  // ── Add payment ────────────────────────────────────────────────────────

  const doAddPayment = async (amt: number) => {
    if (!payEntry) return
    const tid = tenantIdRef.current
    if (!tid) return
    setSaving(true)
    try {
      const { error } = await supabase.from('billing_entry_payments').insert({
        tenant_id: tid, entry_id: payEntry.id, amount: amt, paid_date: payDate, notes: payNotes || null,
      })
      if (error) throw error
      await syncToLedger([{ entry: payEntry, amount: amt }])
      await loadEntries(currentMonth)
      const { data } = await supabase
        .from('billing_entries')
        .select('*, payments:billing_entry_payments(id, amount, paid_date, notes, created_at)')
        .eq('id', payEntry.id).single()
      if (data) setPayEntry(data as BillingEntry)
      setPayAmount(''); setPayNotes('')
      showToast('תשלום נרשם', 'success')
    } catch { showToast('שגיאה', 'error') }
    setSaving(false)
  }

  const addPayment = async () => {
    if (!payEntry) return
    const amt = parseFloat(payAmount)
    if (!amt || amt <= 0) { showToast('הזן סכום תקין', 'error'); return }
    const bal = balance(payEntry)
    if (amt > bal) {
      const ok = await confirm({
        msg: `הסכום שהוזן (${fmt(amt)}) גבוה מהנדרש ב-${fmt(amt - bal)}. יתרת זכות: ${fmt(amt - bal)}. להמשיך?`,
        confirmLabel: 'המשך',
        variant: 'primary',
        icon: '⚠️',
      })
      if (!ok) return
    }
    doAddPayment(amt)
  }

  const deletePayment = async (pid: string) => {
    setSaving(true)
    await supabase.from('billing_entry_payments').delete().eq('id', pid)
    await loadEntries(currentMonth)
    if (payEntry) {
      const { data } = await supabase
        .from('billing_entries')
        .select('*, payments:billing_entry_payments(id, amount, paid_date, notes, created_at)')
        .eq('id', payEntry.id).single()
      if (data) setPayEntry(data as BillingEntry)
    }
    showToast('תשלום נמחק', 'success')
    setSaving(false)
  }

  // ── Contact CRUD ───────────────────────────────────────────────────────

  const openContactModal = (c?: BillingContact) => {
    if (c) {
      setEditContact(c)
      setCoName(c.name); setCoRole(c.role); setCoDir(c.default_direction)
      setCoPhone(c.phone ?? ''); setCoNotes(c.notes ?? '')
    } else {
      setEditContact(null)
      setCoName(''); setCoRole('landlord'); setCoDir('expense'); setCoPhone(''); setCoNotes('')
    }
    setShowContactModal(true)
  }

  const saveContact = async () => {
    if (!coName.trim()) { showToast('הזן שם', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return
    setSaving(true)
    try {
      const row = {
        tenant_id:         tid,
        name:              coName.trim(),
        role:              coRole,
        default_direction: coDir,
        phone:             coPhone.trim() || null,
        notes:             coNotes.trim() || null,
      }
      if (editContact) {
        await supabase.from('billing_contacts').update(row).eq('id', editContact.id)
      } else {
        await supabase.from('billing_contacts').insert(row)
      }
      await loadContacts()
      setShowContactModal(false)
      showToast(editContact ? 'איש קשר עודכן' : 'איש קשר נוסף', 'success')
    } catch { showToast('שגיאה', 'error') }
    setSaving(false)
  }

  const deleteContact = async (id: string) => {
    const ok = await confirm({ msg: 'מחק איש קשר? הסעיפים המקושרים אליו לא יימחקו.' })
    if (!ok) return
    await supabase.from('billing_contacts').delete().eq('id', id)
    await loadContacts()
    showToast('נמחק', 'success')
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────

  const openItemModal = (item?: BillingItem) => {
    if (item) {
      setEditItem(item)
      setIName(item.name); setIContact(item.contact_id ?? ''); setIDir(item.direction)
      setIType(item.type); setIAmt(item.amount != null ? String(item.amount) : '')
      setIPpu(item.price_per_unit != null ? String(item.price_per_unit) : '')
      setIFrom(item.valid_from); setIActive(item.active); setIVat('after')
    } else {
      setEditItem(null)
      setIName(''); setIContact(''); setIDir('expense'); setIType('fixed')
      setIAmt(''); setIPpu(''); setIFrom(monthISO()); setIActive(true); setIVat('after')
    }
    setShowItemModal(true)
  }

  const saveItem = async () => {
    if (!iName.trim()) { showToast('הזן שם סעיף', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return
    setSaving(true)
    try {
      const row = {
        tenant_id:      tid,
        name:           iName.trim(),
        contact_id:     iContact || null,
        direction:      iDir,
        type:           iType,
        amount:         iType === 'fixed' && iAmt ? parseFloat(iAmt) : null,
        price_per_unit: iType === 'meter' && iPpu  ? (parseFloat(iPpu) / (iPpuUnit === 'agorot' ? 100 : 1)) : null,
        valid_from:     iFrom,
        active:         iActive,
      }
      if (editItem) {
        await supabase.from('billing_items').update(row).eq('id', editItem.id)
      } else {
        await supabase.from('billing_items').insert(row)
      }
      await loadItems()
      setShowItemModal(false)
      showToast(editItem ? 'סעיף עודכן' : 'סעיף נוצר', 'success')
    } catch { showToast('שגיאה', 'error') }
    setSaving(false)
  }

  const deleteItem = async (id: string) => {
    const ok = await confirm({ msg: 'מחק סעיף קבוע? הרשומות החודשיות לא יימחקו.' })
    if (!ok) return
    await supabase.from('billing_items').delete().eq('id', id)
    await loadItems()
    showToast('סעיף נמחק', 'success')
  }

  // ── Entry CRUD ─────────────────────────────────────────────────────────

  const openEntryModal = (entry?: BillingEntry) => {
    if (entry) {
      setEditEntry(entry)
      setEName(entry.name); setEContact(entry.contact_id ?? ''); setEDir(entry.direction)
      setEType(entry.meter_prev != null ? 'meter' : 'fixed')
      setEAmt(String(entry.amount))
      setEPrev(entry.meter_prev != null ? String(entry.meter_prev) : '')
      setECurr(entry.meter_curr != null ? String(entry.meter_curr) : '')
      setEPpu(entry.price_per_unit != null ? String(entry.price_per_unit) : '')
      setENotes(entry.notes ?? ''); setEVat('after')
    } else {
      setEditEntry(null)
      setEName(''); setEContact(''); setEDir('income'); setEType('fixed')
      setEAmt(''); setEPrev(''); setECurr(''); setEPpu(''); setENotes(''); setEVat('after')
    }
    setShowEntryModal(true)
  }

  const saveEntry = async () => {
    if (!eName.trim()) { showToast('הזן שם', 'error'); return }
    const tid = tenantIdRef.current
    if (!tid) return
    let finalAmt = parseFloat(eAmt) || 0
    if (eType === 'meter') {
      const ppu = (parseFloat(ePpu) || 0) / (ePpuUnit === 'agorot' ? 100 : 1)
      finalAmt = ((parseFloat(eCurr) || 0) - (parseFloat(ePrev) || 0)) * ppu
    }
    setSaving(true)
    try {
      const row = {
        tenant_id:       tid,
        billing_item_id: editEntry?.billing_item_id ?? null,
        contact_id:      eContact || null,
        month:           currentMonth,
        direction:       eDir,
        name:            eName.trim(),
        amount:          finalAmt,
        meter_prev:      eType === 'meter' && ePrev ? parseFloat(ePrev) : null,
        meter_curr:      eType === 'meter' && eCurr ? parseFloat(eCurr) : null,
        price_per_unit:  eType === 'meter' && ePpu  ? parseFloat(ePpu)  : null,
        notes:           eNotes.trim() || null,
      }
      if (editEntry) {
        await supabase.from('billing_entries').update(row).eq('id', editEntry.id)
      } else {
        await supabase.from('billing_entries').insert(row)
      }
      await loadEntries(currentMonth)
      setShowEntryModal(false)
      showToast(editEntry ? 'רשומה עודכנה' : 'רשומה נוספה', 'success')
    } catch { showToast('שגיאה', 'error') }
    setSaving(false)
  }

  const deleteEntry = async (id: string) => {
    const ok = await confirm({ msg: 'מחק רשומה? היסטוריית התשלומים תימחק גם כן.' })
    if (!ok) return
    await supabase.from('billing_entries').delete().eq('id', id)
    await loadEntries(currentMonth)
    showToast('נמחק', 'success')
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>טוען...</div>
  )

  return (
    <div style={{ padding: '20px', maxWidth: '960px', margin: '0 auto', direction: 'rtl' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>🧾 חשבונות</h1>
        {tab === 'monthly' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => changeMonth(prevMonth(currentMonth))}>→</Button>
            <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '130px', textAlign: 'center' }}>
              {monthLabel(currentMonth)}
            </span>
            <Button variant="secondary" size="sm" onClick={() => changeMonth(nextMonth(currentMonth))}>←</Button>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {([
          ['monthly',  '📅 חודשי'],
          ['items',    '⚙️ סעיפים'],
          ['contacts', '👥 אנשי קשר'],
          ['summary',  '📊 סיכום'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>{label}</button>
        ))}
      </div>

      {/* ════════════════ MONTHLY TAB ════════════════ */}
      {tab === 'monthly' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all','expense','income'] as const).map(f => (
                <Button key={f} size="sm"
                  variant={dirFilter === f ? 'primary' : 'secondary'}
                  onClick={() => setDirFilter(f)}
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  {f === 'all' ? 'הכל' : f === 'expense' ? '↑ הוצאות' : '↓ הכנסות'}
                </Button>
              ))}
            </div>

            {allContactsInMonth.length > 0 && (
              <select value={contactFilter} onChange={e => setContactFilter(e.target.value)}
                style={{ ...selSt, width: 'auto', padding: '5px 10px', fontSize: '12px' }}>
                <option value="">כל אנשי הקשר</option>
                {allContactsInMonth.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({ROLE_LABELS[c.role] ?? c.role})</option>
                ))}
              </select>
            )}

            <div style={{ marginRight: 'auto', display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={() => openEntryModal()}>➕ חריג</Button>
              <Button variant="secondary" size="sm" onClick={generateEntries} disabled={saving}>🔄 צור רשומות</Button>
              {entries.length > 0 && (
                <>
                  <Button size="sm"
                    onClick={payAll}
                    disabled={saving || !contactFilter}
                    title={!contactFilter ? 'בחר איש קשר לפני "שלם הכל"' : undefined}
                    style={{ opacity: !contactFilter ? 0.5 : 1 }}
                  >
                    ⚡ שלם הכל{contactFilter ? ` – ${contactById(contactFilter)?.name ?? ''}` : ''}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditMode(v => !v)}>
                    {editMode ? '✅ סיום' : '✏️ עריכה'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {visibleEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🧾</div>
              אין רשומות לחודש זה.<br />
              <span style={{ fontSize: '12px' }}>לחץ &quot;צור רשומות&quot; ליצירה אוטומטית מהסעיפים הקבועים</span>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={thSt}>שם</th>
                    <th style={thSt}>איש קשר</th>
                    <th style={thSt}>כיוון</th>
                    <th style={thSt}>סכום</th>
                    <th style={thSt}>שולם</th>
                    <th style={thSt}>יתרה</th>
                    <th style={thSt}>סטטוס</th>
                    {editMode && <th style={thSt}></th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map(e => {
                    const badge   = statusBadge(e)
                    const paid    = paidTotal(e)
                    const bal     = balance(e)
                    const contact = entryContactObj(e)
                    return (
                      <tr key={e.id}
                        onClick={() => !editMode && (setPayEntry(e), setPayAmount(String(bal.toFixed(2))), setPayDate(todayISO()), setPayNotes(''))}
                        className={!editMode ? 'tr-hover' : undefined}
                        style={{ borderBottom: '1px solid var(--border)', cursor: editMode ? 'default' : 'pointer' }}
                      >
                        <td style={tdSt}>
                          <div style={{ fontWeight: 500 }}>{e.name}</div>
                          {e.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.notes}</div>}
                          {e.meter_prev != null && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {e.meter_prev} → {e.meter_curr} ({((e.meter_curr ?? 0) - (e.meter_prev ?? 0)).toFixed(0)} יח&apos;)
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdSt, fontSize: '12px' }}>
                          {contact ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{contact.name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{ROLE_LABELS[contact.role] ?? contact.role}</div>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={tdSt}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: e.direction === 'expense' ? '#fef2f2' : '#f0fdf4',
                            color:      e.direction === 'expense' ? 'var(--danger)'  : 'var(--primary)',
                          }}>
                            {e.direction === 'expense' ? '↑ הוצאה' : '↓ הכנסה'}
                          </span>
                        </td>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{fmt(e.amount)}</td>
                        <td style={{ ...tdSt, color: 'var(--primary)' }}>{paid > 0 ? fmt(paid) : '—'}</td>
                        <td style={{ ...tdSt,
                          color: bal > 0 ? 'var(--danger)' : bal < 0 ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: bal !== 0 ? 600 : 400,
                        }}>
                          {bal > 0 ? fmt(bal) : bal < 0 ? `זכות ${fmt(-bal)}` : '—'}
                        </td>
                        <td style={tdSt}>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: badge.bg, color: badge.color,
                          }}>{badge.label}</span>
                        </td>
                        {editMode && (
                          <td style={{ ...tdSt, display: 'flex', gap: '6px' }}>
                            <Button variant="secondary" size="sm"
                              onClick={() => { setPayEntry(e); setPayAmount(String(Math.max(0, balance(e)).toFixed(2))); setPayDate(todayISO()); setPayNotes('') }}>
                              ✏️
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => deleteEntry(e.id)}>🗑️</Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {entries.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'סה"כ הוצאות', total: totalExpenses, paid: totalPaidExp, color: 'var(--danger)' },
                { label: 'סה"כ הכנסות', total: totalIncome,   paid: totalPaidInc, color: 'var(--primary)' },
              ].map(({ label, total, paid, color }) => (
                <div key={label} style={{
                  flex: '1 1 200px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color }}>{fmt(total)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>שולם: {fmt(paid)} · יתרה: {fmt(Math.max(0, total - paid))}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ ITEMS TAB ════════════════ */}
      {tab === 'items' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <Button onClick={() => openItemModal()}>➕ סעיף חדש</Button>
            {items.length > 0 && (
              <Button variant="secondary" style={{ marginRight: 'auto' }} onClick={() => setItemsEdit(v => !v)}>
                {itemsEdit ? '✅ סיום עריכה' : '✏️ עריכה'}
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚙️</div>
              {contacts.length === 0
                ? 'הוסף קודם אנשי קשר (טאב "אנשי קשר"), ואז הגדר סעיפים קבועים'
                : 'הגדר סעיפים קבועים כדי לייצר רשומות אוטומטיות'}
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={thSt}>שם</th>
                    <th style={thSt}>איש קשר</th>
                    <th style={thSt}>כיוון</th>
                    <th style={thSt}>סוג</th>
                    <th style={thSt}>סכום / יח&apos;</th>
                    <th style={thSt}>תוקף מ-</th>
                    <th style={thSt}>פעיל</th>
                    {itemsEdit && <th style={thSt}></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const contact = contactById(it.contact_id)
                    return (
                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border)', opacity: it.active ? 1 : 0.5 }}>
                        <td style={{ ...tdSt, fontWeight: 500 }}>{it.name}</td>
                        <td style={{ ...tdSt, fontSize: '12px' }}>
                          {contact ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{contact.name}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{ROLE_LABELS[contact.role] ?? contact.role}</div>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={tdSt}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: it.direction === 'expense' ? '#fef2f2' : '#f0fdf4',
                            color:      it.direction === 'expense' ? 'var(--danger)'  : 'var(--primary)',
                          }}>
                            {it.direction === 'expense' ? '↑ הוצאה' : '↓ הכנסה'}
                          </span>
                        </td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{it.type === 'fixed' ? 'קבוע' : 'מונה'}</td>
                        <td style={{ ...tdSt, fontWeight: 600 }}>
                          {it.type === 'fixed'
                            ? (it.amount != null ? fmt(it.amount) : '—')
                            : (it.price_per_unit != null ? `₪${it.price_per_unit}/יח'` : '—')}
                        </td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{it.valid_from}</td>
                        <td style={tdSt}>
                          <span style={{ color: it.active ? 'var(--primary)' : '#94a3b8', fontWeight: 600, fontSize: '12px' }}>
                            {it.active ? '✓' : '✗'}
                          </span>
                        </td>
                        {itemsEdit && (
                          <td style={{ ...tdSt, display: 'flex', gap: '6px' }}>
                            <Button variant="secondary" size="sm" onClick={() => openItemModal(it)}>✏️</Button>
                            <Button variant="danger" size="sm" onClick={() => deleteItem(it.id)}>🗑️</Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════ CONTACTS TAB ════════════════ */}
      {tab === 'contacts' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <Button onClick={() => openContactModal()}>➕ איש קשר חדש</Button>
            {contacts.length > 0 && (
              <Button variant="secondary" style={{ marginRight: 'auto' }} onClick={() => setItemsEdit(v => !v)}>
                {itemsEdit ? '✅ סיום עריכה' : '✏️ עריכה'}
              </Button>
            )}
          </div>

          {contacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>👥</div>
              הוסף ספק, שוכר, עירייה – כל גורם שמשתתף בחשבונות
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={thSt}>שם</th>
                    <th style={thSt}>תפקיד</th>
                    <th style={thSt}>כיוון ברירת מחדל</th>
                    <th style={thSt}>טלפון</th>
                    <th style={thSt}>סעיפים פעילים</th>
                    {itemsEdit && <th style={thSt}></th>}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const activeItems = items.filter(it => it.contact_id === c.id && it.active).length
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdSt, fontWeight: 600 }}>{c.name}</td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{ROLE_LABELS[c.role] ?? c.role}</td>
                        <td style={tdSt}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            background: c.default_direction === 'expense' ? '#fef2f2' : '#f0fdf4',
                            color:      c.default_direction === 'expense' ? 'var(--danger)'  : 'var(--primary)',
                          }}>
                            {c.default_direction === 'expense' ? '↑ הוצאה' : '↓ הכנסה'}
                          </span>
                        </td>
                        <td style={{ ...tdSt, color: 'var(--text-muted)' }}>{c.phone ?? '—'}</td>
                        <td style={{ ...tdSt, color: activeItems > 0 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: activeItems > 0 ? 600 : 400 }}>
                          {activeItems > 0 ? `${activeItems} סעיפים` : '—'}
                        </td>
                        {itemsEdit && (
                          <td style={{ ...tdSt, display: 'flex', gap: '6px' }}>
                            <Button variant="secondary" size="sm" onClick={() => openContactModal(c)}>✏️</Button>
                            <Button variant="danger" size="sm" onClick={() => deleteContact(c.id)}>🗑️</Button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════ SUMMARY TAB ════════════════ */}
      {tab === 'summary' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'סה"כ הוצאות', val: totalExpenses, sub: `שולם: ${fmt(totalPaidExp)}`, color: 'var(--danger)' },
              { label: 'סה"כ הכנסות', val: totalIncome,   sub: `שולם: ${fmt(totalPaidInc)}`, color: 'var(--primary)' },
              { label: 'מאזן חודשי',  val: totalIncome - totalExpenses,
                sub: monthLabel(currentMonth), color: totalIncome >= totalExpenses ? 'var(--primary)' : 'var(--danger)' },
            ].map(c => (
              <div key={c.label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '16px', borderTop: `3px solid ${c.color}`,
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{fmt(c.val)}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.sub}</div>
              </div>
            ))}
          </div>

          {allContactsInMonth.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allContactsInMonth.map(c => {
                const cEntries = entries.filter(e => entryContactObj(e)?.id === c.id)
                const cTotal   = cEntries.reduce((s, e) => s + Number(e.amount), 0)
                const cPaid    = cEntries.reduce((s, e) => s + paidTotal(e), 0)
                const cBal     = Math.max(0, cTotal - cPaid)
                return (
                  <div key={c.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '8px' }}>{ROLE_LABELS[c.role] ?? c.role}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                        <span>סה&quot;כ: <strong>{fmt(cTotal)}</strong></span>
                        <span style={{ color: 'var(--primary)' }}>שולם: <strong>{fmt(cPaid)}</strong></span>
                        {cBal > 0 && <span style={{ color: 'var(--danger)' }}>יתרה: <strong>{fmt(cBal)}</strong></span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {cEntries.map(e => {
                        const badge = statusBadge(e)
                        return (
                          <span key={e.id} style={{
                            padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                            background: badge.bg, color: badge.color, border: `1px solid ${badge.color}22`,
                          }}>
                            {e.name} · {fmt(e.amount)}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ PAYMENT MODAL ════════════════ */}
      <Modal
        open={!!payEntry}
        onClose={() => setPayEntry(null)}
        title={payEntry?.name ?? ''}
        maxWidth={500}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayEntry(null)}>סגור</Button>
            {payEntry && balance(payEntry) > 0 && (
              <>
                <Button variant="secondary" disabled={saving}
                  onClick={() => setPayAmount(String(balance(payEntry!).toFixed(2)))}>
                  ⚡ שלם הכל
                </Button>
                <Button onClick={addPayment} loading={saving}>💾 שמור תשלום</Button>
              </>
            )}
          </>
        }
      >
        {payEntry && (
          <>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {fmt(payEntry.amount)} · שולם: {fmt(paidTotal(payEntry))} ·{' '}
              {balance(payEntry) > 0
                ? `יתרה: ${fmt(balance(payEntry))}`
                : balance(payEntry) < 0
                ? <span style={{ color: 'var(--primary)' }}>יתרת זכות: {fmt(-balance(payEntry))}</span>
                : 'שולם במלואו'}
            </div>

            {payEntry.payments.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>היסטוריית תשלומים</div>
                {[...payEntry.payments].sort((a, b) => a.paid_date.localeCompare(b.paid_date)).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: '8px', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmt(p.amount)}</span>
                      {p.notes && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '8px' }}>{p.notes}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.paid_date}</span>
                      <button
                        onClick={async () => {
                          const ok = await confirm({ msg: 'מחק תשלום זה?', icon: '⚠️', confirmLabel: 'מחק' })
                          if (ok) deletePayment(p.id)
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '13px', padding: '0 4px' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {balance(payEntry) > 0 && (
              <div style={{ borderTop: payEntry.payments.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: payEntry.payments.length > 0 ? '16px' : '0' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>הוסף תשלום</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <Input label="סכום" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
                  <Input label="תאריך" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <Input label="הערה" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="אופציונלי..." />
                </div>
                {payEntry.direction === 'expense' && (
                  <div style={{ marginBottom: '4px' }}>
                    <label style={labelSt}>אמצעי תשלום</label>
                    <select style={{ ...selSt, width: 'auto' }} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                      {['מזומן', "צ'ק", 'העברה', 'אשראי'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ════════════════ CONTACT MODAL ════════════════ */}
      <Modal
        open={showContactModal}
        onClose={() => setShowContactModal(false)}
        title={editContact ? 'עריכת איש קשר' : 'איש קשר חדש'}
        maxWidth={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowContactModal(false)}>ביטול</Button>
            <Button onClick={saveContact} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input label="שם" value={coName} onChange={e => setCoName(e.target.value)} placeholder="חברה X, שוכר Y, עירייה..." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelSt}>תפקיד</label>
              <select style={selSt} value={coRole} onChange={e => {
                setCoRole(e.target.value)
                setCoDir(ROLE_DEFAULT_DIR[e.target.value] ?? 'expense')
              }}>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>כיוון ברירת מחדל</label>
              <select style={selSt} value={coDir} onChange={e => setCoDir(e.target.value as 'expense' | 'income')}>
                <option value="expense">↑ הוצאה</option>
                <option value="income">↓ הכנסה</option>
              </select>
            </div>
          </div>
          <Input label="טלפון" value={coPhone} onChange={e => setCoPhone(e.target.value)} placeholder="אופציונלי" />
          <Input label="הערות" value={coNotes} onChange={e => setCoNotes(e.target.value)} placeholder="אופציונלי" />
        </div>
      </Modal>

      {/* ════════════════ ITEM MODAL ════════════════ */}
      <Modal
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editItem ? 'עריכת סעיף' : 'סעיף חדש'}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowItemModal(false)}>ביטול</Button>
            <Button onClick={saveItem} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input label="שם הסעיף" value={iName} onChange={e => setIName(e.target.value)} placeholder="שכירות, ארנונה, חשמל..." />
          <div>
            <label style={labelSt}>איש קשר</label>
            <select style={selSt} value={iContact} onChange={e => {
              setIContact(e.target.value)
              const c = contacts.find(c => c.id === e.target.value)
              if (c) setIDir(c.default_direction)
            }}>
              <option value="">ללא איש קשר</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({ROLE_LABELS[c.role] ?? c.role})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelSt}>
                כיוון {iContact && <span style={{ color: 'var(--primary)', fontSize: '11px' }}>(מוגדר מהאיש קשר)</span>}
              </label>
              <select style={selSt} value={iDir} onChange={e => setIDir(e.target.value as 'expense' | 'income')}>
                <option value="expense">↑ הוצאה</option>
                <option value="income">↓ הכנסה</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>סוג</label>
              <select style={selSt} value={iType} onChange={e => setIType(e.target.value as 'fixed' | 'meter')}>
                <option value="fixed">קבוע</option>
                <option value="meter">לפי מונה</option>
              </select>
            </div>
          </div>
          {iType === 'fixed' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ ...labelSt, marginBottom: 0 }}>סכום חודשי</label>
                <VatToggle mode={iVat} onChange={setIVat} />
              </div>
              <Input type="number" value={iAmt} onChange={e => setIAmt(e.target.value)} placeholder="0.00" />
              {iAmt && parseFloat(iAmt) > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {iVat === 'after'
                    ? `לפני מע"מ: ${fmt(withoutVat(parseFloat(iAmt)))}`
                    : `כולל מע"מ (18%): ${fmt(withVat(parseFloat(iAmt)))}`}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ ...labelSt, marginBottom: 0 }}>מחיר ליחידה</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <UnitToggle unit={iPpuUnit} onChange={setIPpuUnit} />
                  <VatToggle mode={iVat} onChange={setIVat} />
                </div>
              </div>
              <Input type="number" value={iPpu} onChange={e => setIPpu(e.target.value)}
                placeholder={iPpuUnit === 'agorot' ? 'למשל 54.33' : '0.0000'} />
              {iPpu && parseFloat(iPpu) > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px' }}>
                  {iPpuUnit === 'agorot' && <span>= ₪{(parseFloat(iPpu) / 100).toFixed(4)}/יח&apos;</span>}
                  {iVat === 'after'
                    ? `לפני מע"מ: ₪${withoutVat(parseFloat(iPpu) / (iPpuUnit === 'agorot' ? 100 : 1)).toFixed(4)}`
                    : `כולל מע"מ: ₪${withVat(parseFloat(iPpu) / (iPpuUnit === 'agorot' ? 100 : 1)).toFixed(4)}`}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input label="תוקף מ- (YYYY-MM)" type="month" value={iFrom} onChange={e => setIFrom(e.target.value)} />
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={iActive} onChange={e => setIActive(e.target.checked)} />
                סעיף פעיל
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* ════════════════ ENTRY MODAL (חריג) ════════════════ */}
      <Modal
        open={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        title={editEntry ? 'עריכת רשומה' : 'חריג – חיוב חד פעמי'}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowEntryModal(false)}>ביטול</Button>
            <Button onClick={saveEntry} loading={saving}>💾 שמור</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Input label="תיאור" value={eName} onChange={e => setEName(e.target.value)} placeholder="תיאור החיוב..." />
          <div>
            <label style={labelSt}>איש קשר</label>
            <select style={selSt} value={eContact} onChange={e => {
              setEContact(e.target.value)
              const c = contacts.find(c => c.id === e.target.value)
              if (c) setEDir(c.default_direction)
            }}>
              <option value="">ללא איש קשר</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({ROLE_LABELS[c.role] ?? c.role})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelSt}>
                כיוון {eContact && <span style={{ color: 'var(--primary)', fontSize: '11px' }}>(מהאיש קשר)</span>}
              </label>
              <select style={selSt} value={eDir} onChange={e => setEDir(e.target.value as 'expense' | 'income')}>
                <option value="expense">↑ הוצאה</option>
                <option value="income">↓ הכנסה</option>
              </select>
            </div>
            <div>
              <label style={labelSt}>סוג</label>
              <select style={selSt} value={eType} onChange={e => setEType(e.target.value as 'fixed' | 'meter')}>
                <option value="fixed">סכום ישיר</option>
                <option value="meter">לפי מונה</option>
              </select>
            </div>
          </div>

          {eType === 'fixed' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ ...labelSt, marginBottom: 0 }}>סכום</label>
                <VatToggle mode={eVat} onChange={setEVat} />
              </div>
              <Input type="number" value={eAmt} onChange={e => setEAmt(e.target.value)} placeholder="0.00" />
              {eAmt && parseFloat(eAmt) > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {eVat === 'after'
                    ? `לפני מע"מ: ${fmt(withoutVat(parseFloat(eAmt)))}`
                    : `כולל מע"מ (18%): ${fmt(withVat(parseFloat(eAmt)))}`}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <Input label="קריאה קודמת" type="number" value={ePrev} onChange={e => setEPrev(e.target.value)} />
              <Input label="קריאה נוכחית" type="number" value={eCurr} onChange={e => setECurr(e.target.value)} />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...labelSt, marginBottom: 0 }}>מחיר/יח&apos;</label>
                  <UnitToggle unit={ePpuUnit} onChange={setEPpuUnit} />
                </div>
                <Input type="number" value={ePpu} onChange={e => setEPpu(e.target.value)}
                  placeholder={ePpuUnit === 'agorot' ? '54.33' : '0.0000'} />
              </div>
              {ePrev && eCurr && ePpu && (
                <div style={{ gridColumn: '1/-1', fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                  סה&quot;כ: {fmt((parseFloat(eCurr) - parseFloat(ePrev)) * (parseFloat(ePpu) / (ePpuUnit === 'agorot' ? 100 : 1)))}
                  {ePpuUnit === 'agorot' && (
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginRight: '8px' }}>
                      (₪{(parseFloat(ePpu) / 100).toFixed(4)}/יח&apos;)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <Input label="הערה" value={eNotes} onChange={e => setENotes(e.target.value)} placeholder="אופציונלי..." />
        </div>
      </Modal>

    </div>
  )
}
