'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import AppShell from '@/components/layout/AppShell'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import ExcelMenu from '@/components/ui/ExcelMenu'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { RecurringExpense } from './RecurringTab'
import ScheduledPaymentsModal from './ScheduledPaymentsModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = 'מזומן' | 'אשראי' | "צ'ק" | 'העברה'

interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  supplier_id: string | null
  payment_method: PaymentMethod | null
  payment_ref: string | null
}

interface Income {
  id: string
  date: string
  category: string
  description: string
  amount: number
}

interface Supplier { id: string; name: string }

interface SummaryRow {
  month: string
  income: number
  expenses: number
  profit: number
}

type Tab     = 'expenses' | 'income' | 'summary'
type VatMode = 'with' | 'without'

// ─── Default category seeds ───────────────────────────────────────────────────

const DEFAULT_EXPENSE_CATS = ['דלק', 'שכר', 'חשמל', 'מים', 'שכירות', 'ביטוח', 'ציוד', 'ניקיון', 'אחזקה', 'קניות מלאי', 'אחר']
const DEFAULT_INCOME_CATS  = ['שירות', 'צמיגים', 'מוצרים', 'מכירת רכב', 'אחר']
const VAT = 0.18

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

function fmt(n: number) {
  return '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthsDiff(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

function isDue(r: RecurringExpense, currentMonth: string) {
  if (!r.last_applied) return true
  const diff = monthsDiff(r.last_applied, currentMonth)
  return r.frequency === 'bimonthly' ? diff >= 2 : diff >= 1
}

type SumPreset = 'month' | '3m' | '6m' | 'year' | 'custom'

function presetRange(p: SumPreset): { from: string; to: string } {
  const today = new Date()
  const toStr = today.toISOString().slice(0, 10)
  const from  = new Date(today)
  if (p === 'month') {
    from.setDate(1)
  } else if (p === '3m') {
    from.setMonth(from.getMonth() - 3); from.setDate(1)
  } else if (p === '6m') {
    from.setMonth(from.getMonth() - 6); from.setDate(1)
  } else if (p === 'year') {
    from.setFullYear(from.getFullYear() - 1); from.setDate(1)
  } else {
    from.setMonth(from.getMonth() - 1) // custom defaults to last month
  }
  return { from: from.toISOString().slice(0, 10), to: toStr }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '1px solid var(--border)', letterSpacing: '0.3px' }
const TD: React.CSSProperties = { padding: '10px 14px', textAlign: 'right', verticalAlign: 'middle', fontSize: '14px', borderBottom: '1px solid #f1f5f9' }
const SEL: React.CSSProperties = { padding: '8px 12px', fontSize: '14px', border: '1.5px solid var(--border)', borderRadius: '9px', background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none' }
const ICON_BTN: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', fontSize: '15px', opacity: 0.7 }

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderTop: `3px solid ${color}`, boxShadow: 'var(--shadow)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: 40, height: 40, borderRadius: '10px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{fmt(value)}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 36, height: 20, borderRadius: 10, flexShrink: 0, background: on ? 'var(--primary)' : '#cbd5e1', position: 'relative', transition: 'background .2s', display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'right .2s', right: on ? 2 : 18 }} />
      </span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: on ? 'var(--primary)' : 'var(--text-muted)' }}>{label}</span>
    </button>
  )
}

// ── CategorySelect: inline dropdown with "＋ הוסף קטגוריה" ──────────────────

function CategorySelect({
  value, onChange, cats, onAdd, onDelete, label,
}: {
  value: string
  onChange: (v: string) => void
  cats: string[]
  onAdd: (name: string) => void
  onDelete?: (name: string) => void
  label?: string
}) {
  const [adding,   setAdding]   = useState(false)
  const [managing, setManaging] = useState(false)
  const [newCat,   setNewCat]   = useState('')

  const submit = () => {
    const trimmed = newCat.trim()
    if (!trimmed) return
    onAdd(trimmed)
    onChange(trimmed)
    setNewCat('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{label}</label>}

      {adding ? (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            type="text"
            placeholder="שם קטגוריה חדשה..."
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false) }}
            style={{ ...SEL, flex: 1 }}
          />
          <button onClick={submit} style={{ padding: '7px 12px', borderRadius: '9px', border: '1.5px solid #bbf7d0', background: '#f0fdf9', color: '#15803d', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>הוסף</button>
          <button onClick={() => setAdding(false)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>✕</button>
        </div>
      ) : managing ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
          {cats.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: '6px', background: '#fff', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px' }}>{c}</span>
              {onDelete && (
                <button
                  onClick={() => { onDelete(c); if (value === c) onChange(cats.find(x => x !== c) ?? '') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '14px', padding: '2px 4px', opacity: 0.7 }}
                  title="מחק קטגוריה"
                >🗑️</button>
              )}
            </div>
          ))}
          <button onClick={() => setManaging(false)} style={{ marginTop: '4px', padding: '5px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}>סגור</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select value={value} onChange={e => onChange(e.target.value)} style={{ ...SEL, flex: 1 }}>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setAdding(true)} title="הוסף קטגוריה" style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer', fontSize: '15px', color: 'var(--primary)', flexShrink: 0 }}>＋</button>
          {onDelete && <button onClick={() => setManaging(true)} title="נהל קטגוריות" style={{ padding: '7px 9px', borderRadius: '8px', border: '1px solid var(--border)', background: '#f8fafc', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)', flexShrink: 0 }}>✏️</button>}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExpensesClient({ defaultTab = 'expenses' }: { defaultTab?: 'expenses' | 'income' }) {
  const [tab, setTab]             = useState<Tab>(defaultTab)
  const [month, setMonth]         = useState(toMonthStr(new Date()))
  const [expenses, setExpenses]   = useState<Expense[]>([])
  const [income, setIncome]       = useState<Income[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [loading, setLoading]     = useState(true)

  // Dynamic categories
  const [expCats, setExpCats] = useState<string[]>(DEFAULT_EXPENSE_CATS)
  const [incCats, setIncCats] = useState<string[]>(DEFAULT_INCOME_CATS)

  // Search / filter
  const [search,    setSearch]    = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterSup, setFilterSup] = useState('')

  // Summary tab
  const [sumPreset,      setSumPreset]      = useState<SumPreset>('6m')
  const [sumDateFrom,    setSumDateFrom]    = useState(() => presetRange('6m').from)
  const [sumDateTo,      setSumDateTo]      = useState(() => presetRange('6m').to)
  const [summaryRows,    setSummaryRows]    = useState<SummaryRow[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Add/Edit modal
  const [modal,    setModal]    = useState(false)
  const [editItem, setEditItem] = useState<Expense | Income | null>(null)
  const [saving,   setSaving]   = useState(false)

  // Form fields
  const [fDate,        setFDate]        = useState('')
  const [fCat,         setFCat]         = useState('')
  const [fDesc,        setFDesc]        = useState('')
  const [fAmount,      setFAmount]      = useState('')
  const [fSupplier,    setFSupplier]    = useState('')
  const [fPayMethod,   setFPayMethod]   = useState<PaymentMethod>('מזומן')
  const [fPayRef,      setFPayRef]      = useState('')
  const [fVatMode,     setFVatMode]     = useState<VatMode>('without')
  const [fIsRecurring,   setFIsRecurring]   = useState(false)
  const [fRecurFreq,     setFRecurFreq]     = useState<'monthly' | 'bimonthly'>('monthly')
  const [fRecurVar,      setFRecurVar]      = useState(false)
  const [fIsScheduled,   setFIsScheduled]   = useState(false)
  const [fSchedDue,      setFSchedDue]      = useState('')
  const [fSchedMethod,   setFSchedMethod]   = useState<'check' | 'transfer'>('check')
  const [fSchedRef,      setFSchedRef]      = useState('')

  // Recurring management modals
  const [recListModal, setRecListModal] = useState(false)
  const [recFormModal, setRecFormModal] = useState(false)
  const [editRec,      setEditRec]      = useState<RecurringExpense | null>(null)
  const [recSaving,    setRecSaving]    = useState(false)
  const [rfDesc,       setRfDesc]       = useState('')
  const [rfCat,        setRfCat]        = useState('')
  const [rfAmount,     setRfAmount]     = useState('')
  const [rfIsVar,      setRfIsVar]      = useState(false)
  const [rfFreq,       setRfFreq]       = useState<'monthly' | 'bimonthly'>('monthly')
  const [rfSupplier,   setRfSupplier]   = useState('')

  // Edit mode (show row action buttons)
  const [editMode, setEditMode] = useState(false)

  // Scheduled payments modal
  const [schedModal, setSchedModal] = useState(false)

  // Variable recurring prompt
  const [pendingVars, setPendingVars] = useState<RecurringExpense[]>([])
  const [varModal,    setVarModal]    = useState(false)
  const [varAmount,   setVarAmount]   = useState('')
  const [varSaving,   setVarSaving]   = useState(false)

  const { confirm }   = useConfirm()
  const { showToast } = useToast()
  const supabase      = useRef(createClient()).current
  const tenantIdRef   = useRef<string | null>(null)
  const currentMonth  = toMonthStr(new Date())

  // ── Clear filters on tab change ────────────────────────────────────────────

  useEffect(() => {
    setSearch(''); setFilterCat(''); setFilterSup('')
  }, [tab])

  // ── Resolve tenant once ────────────────────────────────────────────────────

  const resolveTenant = async () => {
    if (tenantIdRef.current) return tenantIdRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
    tenantIdRef.current = profile?.tenant_id ?? null
    return tenantIdRef.current
  }

  // ── Load dynamic categories (seed if empty) ────────────────────────────────

  const loadCategories = useCallback(async (tenantId: string) => {
    const [expRes, incRes] = await Promise.all([
      supabase.from('expense_categories').select('name').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('income_categories').select('name').eq('tenant_id', tenantId).order('created_at'),
    ])

    // Seed expense categories if none exist
    if (!expRes.data || expRes.data.length === 0) {
      await supabase.from('expense_categories').insert(
        DEFAULT_EXPENSE_CATS.map(name => ({ tenant_id: tenantId, name }))
      )
      setExpCats(DEFAULT_EXPENSE_CATS)
    } else {
      setExpCats(expRes.data.map(r => r.name))
    }

    // Seed income categories if none exist
    if (!incRes.data || incRes.data.length === 0) {
      await supabase.from('income_categories').insert(
        DEFAULT_INCOME_CATS.map(name => ({ tenant_id: tenantId, name }))
      )
      setIncCats(DEFAULT_INCOME_CATS)
    } else {
      setIncCats(incRes.data.map(r => r.name))
    }
  }, [supabase])

  // ── Add a new category ─────────────────────────────────────────────────────

  const addCategory = async (type: 'expense' | 'income', name: string) => {
    if (!tenantIdRef.current) return
    const table = type === 'expense' ? 'expense_categories' : 'income_categories'
    const { error } = await supabase.from(table).insert({ tenant_id: tenantIdRef.current, name })
    if (error) { showToast('שגיאה בהוספת קטגוריה', 'error'); return }
    if (type === 'expense') setExpCats(prev => [...prev, name])
    else setIncCats(prev => [...prev, name])
  }

  const deleteCategory = async (type: 'expense' | 'income', name: string) => {
    if (!tenantIdRef.current) return
    const table = type === 'expense' ? 'expense_categories' : 'income_categories'
    await supabase.from(table).delete().eq('tenant_id', tenantIdRef.current).eq('name', name)
    if (type === 'expense') setExpCats(prev => prev.filter(c => c !== name))
    else setIncCats(prev => prev.filter(c => c !== name))
  }

  // ── Fetch monthly data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const tenantId = await resolveTenant()

    const [y, m] = month.split('-')
    const from    = `${y}-${m}-01`
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    const to      = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

    const [expRes, incRes, supRes, recRes] = await Promise.all([
      supabase.from('expenses').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }),
      supabase.from('income').select('*').gte('date', from).lte('date', to).order('date', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('recurring_expenses').select('*').order('description'),
    ])

    setExpenses(expRes.data ?? [])
    setIncome(incRes.data ?? [])
    setSuppliers(supRes.data ?? [])
    const recList = recRes.data ?? []
    setRecurring(recList)
    setLoading(false)

    // Load categories once tenant resolved
    if (tenantId) loadCategories(tenantId)

    // Auto-apply recurring only for current month
    if (month === currentMonth && tenantId) {
      const applied = await applyRecurring(recList.filter(r => r.is_active), tenantId)
      if (applied > 0) {
        const fresh = await supabase.from('expenses').select('*').gte('date', from).lte('date', to).order('date', { ascending: false })
        setExpenses(fresh.data ?? [])
      }
    }
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  // ── Fetch summary (multi-month) ────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true)

    const [expRes, incRes] = await Promise.all([
      supabase.from('expenses').select('date, amount').gte('date', sumDateFrom).lte('date', sumDateTo),
      supabase.from('income').select('date, amount').gte('date', sumDateFrom).lte('date', sumDateTo),
    ])

    // Build month map covering the full range
    const map: Record<string, { income: number; expenses: number }> = {}
    let d = new Date(sumDateFrom.slice(0, 7) + '-01')
    const end = new Date(sumDateTo.slice(0, 7) + '-01')
    while (d <= end) {
      map[toMonthStr(d)] = { income: 0, expenses: 0 }
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }

    for (const r of expRes.data ?? []) {
      const k = r.date.slice(0, 7)
      if (map[k]) map[k].expenses += Number(r.amount)
    }
    for (const r of incRes.data ?? []) {
      const k = r.date.slice(0, 7)
      if (map[k]) map[k].income += Number(r.amount)
    }

    setSummaryRows(
      Object.entries(map)
        .map(([month, data]) => ({ month, ...data, profit: data.income - data.expenses }))
        .sort((a, b) => b.month.localeCompare(a.month))
    )
    setSummaryLoading(false)
  }, [sumDateFrom, sumDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'summary') fetchSummary()
  }, [tab, fetchSummary])

  // ── Auto-apply recurring ────────────────────────────────────────────────────

  const applyRecurring = async (rows: RecurringExpense[], tenantId: string): Promise<number> => {
    const due      = rows.filter(r => isDue(r, currentMonth))
    const fixed    = due.filter(r => !r.is_variable)
    const variable = due.filter(r => r.is_variable)
    let count = 0

    if (fixed.length > 0) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('expenses').insert(
        fixed.map(r => ({ tenant_id: tenantId, date: today, category: r.category, description: r.description, amount: r.amount, supplier_id: r.supplier_id }))
      )
      await Promise.all(fixed.map(r => supabase.from('recurring_expenses').update({ last_applied: currentMonth }).eq('id', r.id)))
      showToast(`${fixed.length} הוצאות קבועות נוספו אוטומטית ✓`, 'success')
      count += fixed.length
    }

    if (variable.length > 0) {
      setPendingVars(variable)
      setVarAmount('')
      setVarModal(true)
    }

    return count
  }

  // ── Variable recurring prompt ──────────────────────────────────────────────

  const currentVar = pendingVars[0] ?? null

  const handleVarAdd = async () => {
    if (!currentVar || !varAmount || isNaN(parseFloat(varAmount))) return
    if (!tenantIdRef.current) return
    setVarSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('expenses').insert({ tenant_id: tenantIdRef.current, date: today, category: currentVar.category, description: currentVar.description, amount: parseFloat(varAmount), supplier_id: currentVar.supplier_id })
    await supabase.from('recurring_expenses').update({ last_applied: currentMonth }).eq('id', currentVar.id)
    setVarSaving(false)
    advanceVar()
    fetchData()
  }

  const handleVarSkip = async () => {
    if (!currentVar) return
    await supabase.from('recurring_expenses').update({ last_applied: currentMonth }).eq('id', currentVar.id)
    advanceVar()
  }

  const advanceVar = () => {
    setPendingVars(prev => {
      const next = prev.slice(1)
      if (next.length === 0) setVarModal(false)
      setVarAmount('')
      return next
    })
  }

  // ── Month nav ──────────────────────────────────────────────────────────────

  const shiftMonth = (dir: -1 | 1) => {
    const d = new Date(month + '-01')
    d.setMonth(d.getMonth() + dir)
    setMonth(toMonthStr(d))
  }

  // ── Add / Edit expense or income ───────────────────────────────────────────

  const openAdd = () => {
    setEditItem(null)
    setFDate(new Date().toISOString().slice(0, 10))
    setFCat(tab === 'income' ? (incCats[0] ?? '') : (expCats[0] ?? ''))
    setFDesc(''); setFAmount(''); setFSupplier('')
    setFPayMethod('מזומן'); setFPayRef('')
    setFVatMode('without')
    setFIsRecurring(false); setFRecurFreq('monthly'); setFRecurVar(false)
    setFIsScheduled(false); setFSchedDue(''); setFSchedMethod('check'); setFSchedRef('')
    setModal(true)
  }

  const openEdit = (item: Expense | Income) => {
    setEditItem(item)
    setFDate(item.date)
    setFCat(item.category)
    setFDesc(item.description || '')
    setFAmount(String(item.amount))
    setFSupplier((item as Expense).supplier_id ?? '')
    setFPayMethod((item as Expense).payment_method ?? 'מזומן')
    setFPayRef((item as Expense).payment_ref ?? '')
    setFVatMode('without')
    setFIsRecurring(false); setFRecurFreq('monthly'); setFRecurVar(false)
    setFIsScheduled(false); setFSchedDue(''); setFSchedMethod('check'); setFSchedRef('')
    setModal(true)
  }

  const save = async () => {
    if (!fDate || !fAmount) return
    const amount = parseFloat(fAmount)
    if (isNaN(amount) || amount <= 0) return
    if (!tenantIdRef.current) { showToast('שגיאה: לא נמצא tenant', 'error'); return }
    setSaving(true)

    let error: { message: string } | null = null

    if (tab === 'expenses') {
      // If scheduled (future payment) → save to scheduled_payments only
      if (!editItem && fIsScheduled) {
        const res = await supabase.from('scheduled_payments').insert({
          tenant_id:      tenantIdRef.current,
          description:    fDesc || fCat,
          amount,
          due_date:       fSchedDue || fDate,
          payment_method: fSchedMethod,
          supplier_id:    fSupplier || null,
          category:       fCat || null,
          notes:          fSchedRef || null,
        })
        error = res.error
      } else {
        const payload = {
          date: fDate, category: fCat, description: fDesc, amount,
          supplier_id: fSupplier || null,
          payment_method: fPayMethod,
          payment_ref: (fPayMethod === "צ'ק" || fPayMethod === 'העברה') ? (fPayRef || null) : null,
        }
        const res = editItem
          ? await supabase.from('expenses').update(payload).eq('id', editItem.id)
          : await supabase.from('expenses').insert({ ...payload, tenant_id: tenantIdRef.current })
        error = res.error
      }

      if (!error && !editItem && fIsRecurring && !fIsScheduled) {
        await supabase.from('recurring_expenses').insert({
          tenant_id:   tenantIdRef.current,
          description: fDesc || fCat,
          category:    fCat,
          amount:      fRecurVar ? null : amount,
          is_variable: fRecurVar,
          frequency:   fRecurFreq,
          supplier_id: fSupplier || null,
          last_applied: currentMonth,
          is_active:   true,
        })
      }
    } else {
      const payload = { date: fDate, category: fCat, description: fDesc, amount }
      const res = editItem
        ? await supabase.from('income').update(payload).eq('id', editItem.id)
        : await supabase.from('income').insert({ ...payload, tenant_id: tenantIdRef.current })
      error = res.error
    }

    setSaving(false)
    if (error) { showToast('שגיאה בשמירה: ' + error.message, 'error'); return }
    showToast(editItem ? 'עודכן בהצלחה' : 'נוסף בהצלחה', 'success')
    setModal(false)
    fetchData()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const del = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק את הרשומה?', icon: '🗑️' })
    if (!ok) return
    await supabase.from(tab === 'expenses' ? 'expenses' : 'income').delete().eq('id', id)
    fetchData()
  }

  // ── Recurring form ─────────────────────────────────────────────────────────

  const openRecForm = (r?: RecurringExpense) => {
    setEditRec(r ?? null)
    setRfDesc(r?.description ?? '')
    setRfCat(r?.category ?? (expCats[0] ?? ''))
    setRfAmount(r?.amount != null ? String(r.amount) : '')
    setRfIsVar(r?.is_variable ?? false)
    setRfFreq(r?.frequency ?? 'monthly')
    setRfSupplier(r?.supplier_id ?? '')
    setRecListModal(false)
    setRecFormModal(true)
  }

  const saveRec = async () => {
    if (!rfDesc) return
    if (!rfIsVar && (!rfAmount || isNaN(parseFloat(rfAmount)))) return
    if (!tenantIdRef.current) return
    setRecSaving(true)
    const payload = {
      tenant_id:   tenantIdRef.current,
      description: rfDesc, category: rfCat,
      amount:      rfIsVar ? null : parseFloat(rfAmount),
      is_variable: rfIsVar, frequency: rfFreq,
      supplier_id: rfSupplier || null,
      is_active:   true,
    }
    const res = editRec
      ? await supabase.from('recurring_expenses').update(payload).eq('id', editRec.id)
      : await supabase.from('recurring_expenses').insert(payload)
    setRecSaving(false)
    if (res.error) { showToast('שגיאה: ' + res.error.message, 'error'); return }
    showToast(editRec ? 'עודכן' : 'נוסף', 'success')
    setRecFormModal(false)
    setRecListModal(true)
    fetchData()
  }

  const delRec = async (id: string) => {
    const ok = await confirm({ msg: 'למחוק הוצאה קבועה זו?', icon: '🗑️' })
    if (!ok) return
    await supabase.from('recurring_expenses').delete().eq('id', id)
    fetchData()
  }

  const toggleRecActive = async (r: RecurringExpense) => {
    await supabase.from('recurring_expenses').update({ is_active: !r.is_active }).eq('id', r.id)
    fetchData()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0)
  const totalIncome   = income.reduce((s, r) => s + Number(r.amount), 0)
  const profit        = totalIncome - totalExpenses
  const cats          = tab === 'income' ? incCats : expCats
  const activeRec     = recurring.filter(r => r.is_active)

  const baseRows = tab === 'expenses' ? expenses : income
  const filteredRows = baseRows.filter(row => {
    if (search) {
      const q       = search.toLowerCase()
      const supName = tab === 'expenses' ? (suppliers.find(s => s.id === (row as Expense).supplier_id)?.name ?? '') : ''
      if (!(row.description?.toLowerCase().includes(q) || row.category?.toLowerCase().includes(q) || supName.toLowerCase().includes(q))) return false
    }
    if (filterCat && row.category !== filterCat) return false
    if (filterSup && tab === 'expenses' && (row as Expense).supplier_id !== filterSup) return false
    return true
  })

  const parsedAmount  = parseFloat(fAmount)
  const hasAmount     = !isNaN(parsedAmount) && parsedAmount > 0
  const vatComplement = hasAmount
    ? (fVatMode === 'with' ? `לפני מע"מ: ${fmt(parsedAmount / (1 + VAT))}` : `כולל מע"מ: ${fmt(parsedAmount * (1 + VAT))}`)
    : null

  const sumTotalInc = summaryRows.reduce((s, r) => s + r.income, 0)
  const sumTotalExp = summaryRows.reduce((s, r) => s + r.expenses, 0)
  const sumTotalPro = summaryRows.reduce((s, r) => s + r.profit, 0)

  // ── Excel / JSON export & import ───────────────────────────────────────────

  function exportExcel() {
    if (tab === 'summary') {
      const rows = summaryRows.map(r => ({ חודש: r.month, הכנסות: r.income, הוצאות: r.expenses, רווח: r.profit }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'סיכום')
      XLSX.writeFile(wb, 'סיכום-חודשי.xlsx')
      return
    }
    if (tab === 'expenses') {
      const rows = expenses.map(e => ({
        תאריך: e.date, קטגוריה: e.category, תיאור: e.description,
        סכום: e.amount, ספק: suppliers.find(s => s.id === e.supplier_id)?.name ?? '',
        'אמצעי תשלום': e.payment_method ?? '', אסמכתא: e.payment_ref ?? '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'הוצאות')
      XLSX.writeFile(wb, `הוצאות-${month}.xlsx`)
    } else {
      const rows = income.map(e => ({ תאריך: e.date, קטגוריה: e.category, תיאור: e.description, סכום: e.amount }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'הכנסות')
      XLSX.writeFile(wb, `הכנסות-${month}.xlsx`)
    }
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const data = await file.arrayBuffer()
    const wb   = XLSX.read(data)
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]])
    if (!rows.length) { showToast('הקובץ ריק', 'error'); return }
    const supabase = createClient()
    const { data: profile } = await supabase.from('profiles').select('tenant_id').single()
    if (!profile) return
    let imported = 0
    for (const r of rows) {
      if (tab === 'expenses') {
        const sup = r['ספק'] ? suppliers.find(s => s.name === r['ספק']) : null
        await supabase.from('expenses').insert({
          tenant_id: profile.tenant_id,
          date: r['תאריך'] || new Date().toISOString().slice(0, 10),
          category: r['קטגוריה'] || 'אחר',
          description: r['תיאור'] || '',
          amount: parseFloat(String(r['סכום'])) || 0,
          supplier_id: sup?.id ?? null,
          payment_method: r['אמצעי תשלום'] || null,
          payment_ref: r['אסמכתא'] || null,
        })
      } else {
        await supabase.from('income').insert({
          tenant_id: profile.tenant_id,
          date: r['תאריך'] || new Date().toISOString().slice(0, 10),
          category: r['קטגוריה'] || 'אחר',
          description: r['תיאור'] || '',
          amount: parseFloat(String(r['סכום'])) || 0,
        })
      }
      imported++
    }
    await fetchData()
    showToast(`יובאו ${imported} רשומות`, 'success')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#1a9e5c,#4ade80)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px #1a9e5c44' }}><svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>הוצאות והכנסות</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', marginBottom: 0 }}>ניהול תזרים מזומנים חודשי</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {tab !== 'summary' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#f1f5f9', borderRadius: '10px', padding: '4px 6px' }}>
              <button onClick={() => shiftMonth(1)}  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px 6px', lineHeight: 1 }}>›</button>
              <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '130px', textAlign: 'center' }}>{monthLabel(month)}</span>
              <button onClick={() => shiftMonth(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', padding: '2px 6px', lineHeight: 1 }}>‹</button>
            </div>
          )}
          {tab !== 'summary' && (
            <Button onClick={openAdd}>+ הוסף {tab === 'expenses' ? 'הוצאה' : 'הכנסה'}</Button>
          )}
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────────── */}
      {tab !== 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <SummaryCard label="סה״כ הכנסות" value={totalIncome}   color="var(--primary)"                                    icon="💰" />
          <SummaryCard label="סה״כ הוצאות" value={totalExpenses} color="var(--danger)"                                     icon="📤" />
          <SummaryCard label="רווח החודש"  value={profit}        color={profit >= 0 ? 'var(--primary)' : 'var(--danger)'} icon="📈" />
        </div>
      )}

      {/* ── Tabs row ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        {/* Tabs */}
        <div className="scrollable-tabs" style={{ display: 'flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px' }}>
          {([
            ['expenses', '📤 הוצאות'],
            ['income',   '💰 הכנסות'],
            ['summary',  '📊 סיכום חודשי'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              padding: '7px 16px', fontSize: '13px',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              background: tab === t ? '#fff' : 'transparent',
              borderRadius: '8px', whiteSpace: 'nowrap',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              transition: 'all .15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Action buttons – far left (RTL) */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {/* Edit mode toggle */}
          <button
            onClick={() => setEditMode(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              border: `1px solid ${editMode ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: '8px', padding: '6px 12px',
              background: editMode ? '#f0fdf4' : '#fff',
              cursor: 'pointer', fontSize: '13px',
              color: editMode ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: editMode ? 600 : 400,
            }}
          >
            ✏️ {editMode ? 'יציאה מעריכה' : 'עריכה'}
          </button>
          {/* Scheduled payments button */}
          <button
            onClick={() => setSchedModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 12px', background: '#fff', cursor: 'pointer',
              fontSize: '13px', color: 'var(--text-muted)',
            }}
          >
            📅 תשלומים
          </button>

          {/* Recurring button */}
          <button
            onClick={() => setRecListModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              border: '1px solid var(--border)', borderRadius: '8px',
              padding: '6px 12px', background: '#fff', cursor: 'pointer',
              fontSize: '13px', color: 'var(--text-muted)',
            }}
          >
            🔁 קבועות
            {activeRec.length > 0 && (
              <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '11px' }}>
                {activeRec.length}
              </span>
            )}
          </button>
          <ExcelMenu
            onExportExcel={exportExcel}
            onImportExcel={tab !== 'summary' ? importExcel : undefined}
          />
        </div>
      </div>

      {/* ── Search / filter bar ───────────────────────────────────────────────── */}
      {(tab === 'expenses' || tab === 'income') && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: '14px' }}>🔍</span>
            <input
              type="text"
              placeholder="חיפוש לפי תיאור, קטגוריה, ספק..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...SEL, width: '100%', paddingRight: '32px' }}
            />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SEL, minWidth: '130px' }}>
            <option value="">כל הקטגוריות</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {tab === 'expenses' && suppliers.length > 0 && (
            <select value={filterSup} onChange={e => setFilterSup(e.target.value)} style={{ ...SEL, minWidth: '130px' }}>
              <option value="">כל הספקים</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {(search || filterCat || filterSup) && (
            <button
              onClick={() => { setSearch(''); setFilterCat(''); setFilterSup('') }}
              style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', background: '#fff', cursor: 'pointer', fontSize: '13px', color: 'var(--danger)', whiteSpace: 'nowrap' }}
            >
              ✕ נקה
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Summary tab ───────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'summary' && (
        <div>
          {/* Preset buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {([
              ['month', 'חודש נוכחי'],
              ['3m',    '3 חודשים'],
              ['6m',    '6 חודשים'],
              ['year',  'שנה'],
              ['custom','מותאם אישית'],
            ] as [SumPreset, string][]).map(([p, label]) => (
              <button
                key={p}
                onClick={() => {
                  setSumPreset(p)
                  if (p !== 'custom') {
                    const r = presetRange(p)
                    setSumDateFrom(r.from)
                    setSumDateTo(r.to)
                  }
                }}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                  border: `1px solid ${sumPreset === p ? 'var(--primary)' : 'var(--border)'}`,
                  background: sumPreset === p ? 'var(--primary)' : '#fff',
                  color: sumPreset === p ? '#fff' : 'var(--text-muted)',
                  transition: 'all .15s',
                }}
              >{label}</button>
            ))}
          </div>

          {/* Custom date range */}
          {sumPreset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>מתאריך</label>
                <input type="date" value={sumDateFrom} onChange={e => setSumDateFrom(e.target.value)} style={{ ...SEL, width: 'auto' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>עד תאריך</label>
                <input type="date" value={sumDateTo} onChange={e => setSumDateTo(e.target.value)} style={{ ...SEL, width: 'auto' }} />
              </div>
              <Button size="sm" onClick={fetchSummary}>רענן</Button>
            </div>
          )}

          {summaryLoading ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {Array(6).fill(0).map((_, i) => <div key={i} style={{ height: 44, background: '#f1f5f9', borderRadius: '8px' }} />)}
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                    <th style={TH}>חודש</th>
                    <th style={{ ...TH, textAlign: 'left', color: 'var(--primary)' }}>הכנסות</th>
                    <th style={{ ...TH, textAlign: 'left', color: 'var(--danger)' }}>הוצאות</th>
                    <th style={{ ...TH, textAlign: 'left' }}>רווח</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>אין נתונים לטווח הנבחר</td></tr>
                  ) : summaryRows.map(r => {
                    const isCurrent = r.month === currentMonth
                    return (
                      <tr
                        key={r.month}
                        className={!isCurrent ? 'tr-hover' : undefined}
                        style={{ borderBottom: '1px solid var(--border)', background: isCurrent ? '#f0fdf4' : '' }}
                      >
                        <td style={{ ...TD, fontWeight: isCurrent ? 700 : 400 }}>
                          {monthLabel(r.month)}
                          {isCurrent && <span style={{ marginRight: '6px', fontSize: '11px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '1px 6px' }}>נוכחי</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: 'var(--primary)' }}>{r.income > 0 ? fmt(r.income) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'left', fontWeight: 600, color: 'var(--danger)' }}>{r.expenses > 0 ? fmt(r.expenses) : '—'}</td>
                        <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: r.profit >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                          {r.income === 0 && r.expenses === 0 ? '—' : fmt(r.profit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {summaryRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border)', fontWeight: 800 }}>
                      <td style={TD}>סה״כ ({summaryRows.length} חודשים)</td>
                      <td style={{ ...TD, textAlign: 'left', color: 'var(--primary)' }}>{fmt(sumTotalInc)}</td>
                      <td style={{ ...TD, textAlign: 'left', color: 'var(--danger)' }}>{fmt(sumTotalExp)}</td>
                      <td style={{ ...TD, textAlign: 'left', color: sumTotalPro >= 0 ? 'var(--primary)' : 'var(--danger)' }}>{fmt(sumTotalPro)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Expenses / Income table ───────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {(tab === 'expenses' || tab === 'income') && (
        loading ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {Array(5).fill(0).map((_, i) => <div key={i} style={{ height: 44, background: '#f1f5f9', borderRadius: '8px' }} />)}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
            {(search || filterCat || filterSup) && (
              <div style={{ padding: '8px 14px', background: '#f0fdf4', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--primary)' }}>
                {filteredRows.length} תוצאות מתוך {baseRows.length}
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>תאריך</th>
                  <th style={TH}>קטגוריה</th>
                  <th style={TH}>תיאור</th>
                  {tab === 'expenses' && <th style={TH}>ספק</th>}
                  {tab === 'expenses' && <th style={TH}>תשלום</th>}
                  <th style={{ ...TH, textAlign: 'left' }}>סכום</th>
                  <th style={{ ...TH, width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={tab === 'expenses' ? 7 : 5} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
                      {baseRows.length === 0 ? 'אין רשומות לחודש זה' : 'לא נמצאו תוצאות לחיפוש'}
                    </td>
                  </tr>
                ) : filteredRows.map(row => (
                  <tr key={row.id} className="tr-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...TD, color: 'var(--text-muted)' }}>{new Date(row.date + 'T00:00:00').toLocaleDateString('he-IL')}</td>
                    <td style={TD}><span style={{ background: '#f1f5f9', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: 500 }}>{row.category}</span></td>
                    <td style={{ ...TD, color: row.description ? 'var(--text)' : 'var(--text-muted)' }}>{row.description || '—'}</td>
                    {tab === 'expenses' && (
                      <td style={{ ...TD, color: 'var(--text-muted)' }}>{suppliers.find(s => s.id === (row as Expense).supplier_id)?.name || '—'}</td>
                    )}
                    {tab === 'expenses' && (() => {
                      const exp = row as Expense
                      const pm  = exp.payment_method
                      const pmColors: Record<string, { color: string; bg: string }> = {
                        'מזומן':   { color: '#16a34a', bg: '#f0fdf4' },
                        'אשראי':   { color: '#2563eb', bg: '#eff6ff' },
                        "צ'ק":    { color: '#92400e', bg: '#fef9c3' },
                        'העברה':   { color: '#6d28d9', bg: '#f5f3ff' },
                      }
                      const cs = pm ? (pmColors[pm] ?? { color: 'var(--text-muted)', bg: '#f1f5f9' }) : null
                      return (
                        <td style={TD}>
                          {pm && cs ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: cs.color, background: cs.bg, borderRadius: '6px', padding: '2px 7px', whiteSpace: 'nowrap' }}>{pm}</span>
                              {exp.payment_ref && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{exp.payment_ref}</span>}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      )
                    })()}
                    <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: tab === 'expenses' ? 'var(--danger)' : 'var(--primary)' }}>{fmt(row.amount)}</td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      {editMode && <>
                        <button onClick={() => openEdit(row)} style={ICON_BTN}>✏️</button>
                        <button onClick={() => del(row.id)}   style={ICON_BTN}>🗑️</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={tab === 'expenses' ? 5 : 3} style={{ ...TD, fontWeight: 700, color: 'var(--text-muted)' }}>
                      סה״כ ({filteredRows.length} רשומות{filteredRows.length !== baseRows.length ? ` מתוך ${baseRows.length}` : ''})
                    </td>
                    <td style={{ ...TD, textAlign: 'left', fontWeight: 800, color: tab === 'expenses' ? 'var(--danger)' : 'var(--primary)' }}>
                      {fmt(filteredRows.reduce((s, r) => s + Number(r.amount), 0))}
                    </td>
                    <td style={TD} />
                  </tr>
                </tfoot>
              )}
            </table>
            </div>
          </div>
        )
      )}

      {/* ══ Add / Edit modal ═════════════════════════════════════════════════ */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editItem ? `עריכת ${tab === 'expenses' ? 'הוצאה' : 'הכנסה'}` : `הוספת ${tab === 'expenses' ? 'הוצאה' : 'הכנסה'}`}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>ביטול</Button><Button onClick={save} loading={saving}>💾 שמור</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="תאריך" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />

          <CategorySelect
            label="קטגוריה"
            value={fCat}
            onChange={setFCat}
            cats={tab === 'income' ? incCats : expCats}
            onAdd={name => addCategory(tab === 'income' ? 'income' : 'expense', name)}
            onDelete={name => deleteCategory(tab === 'income' ? 'income' : 'expense', name)}
          />

          <Input label="תיאור" placeholder="תיאור אופציונלי" value={fDesc} onChange={e => setFDesc(e.target.value)} />

          {/* Amount + VAT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Input label="סכום" type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={fAmount} onChange={e => setFAmount(e.target.value)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFVatMode(v => v === 'with' ? 'without' : 'with')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  border: `1px solid ${fVatMode === 'with' ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: '6px', padding: '3px 10px', cursor: 'pointer',
                  background: fVatMode === 'with' ? '#f0fdf4' : '#f8fafc',
                  fontSize: '12px', fontWeight: 500,
                  color: fVatMode === 'with' ? 'var(--primary)' : 'var(--text-muted)',
                  transition: 'all .15s',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: fVatMode === 'with' ? 'var(--primary)' : 'var(--border)', display: 'inline-block' }} />
                {fVatMode === 'with' ? 'כולל מע"מ (18%)' : 'ללא מע"מ'}
              </button>
              {vatComplement && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>→ {vatComplement}</span>}
            </div>
          </div>

          {tab === 'expenses' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>ספק (אופציונלי)</label>
              <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={{ ...SEL, width: '100%' }}>
                <option value="">— ללא ספק —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Payment method – expenses only, hidden when scheduled (scheduled has its own) */}
          {tab === 'expenses' && !fIsScheduled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>אמצעי תשלום</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['מזומן', 'אשראי', "צ'ק", 'העברה'] as PaymentMethod[]).map(m => (
                  <button key={m} type="button" onClick={() => setFPayMethod(m)} style={{
                    padding: '7px 4px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                    border: `1px solid ${fPayMethod === m ? 'var(--primary)' : 'var(--border)'}`,
                    background: fPayMethod === m ? '#f0fdf4' : '#f8fafc',
                    color: fPayMethod === m ? 'var(--primary)' : 'var(--text-muted)',
                    textAlign: 'center',
                  }}>
                    {m === 'מזומן' ? '💵' : m === 'אשראי' ? '💳' : m === "צ'ק" ? '📝' : '🏦'} {m}
                  </button>
                ))}
              </div>
              {(fPayMethod === "צ'ק" || fPayMethod === 'העברה') && (
                <input
                  type="text"
                  placeholder={fPayMethod === "צ'ק" ? "מס' צ'ק (אופציונלי)" : 'אסמכתא (אופציונלי)'}
                  value={fPayRef}
                  onChange={e => setFPayRef(e.target.value)}
                  style={{ ...SEL, width: '100%' }}
                />
              )}
            </div>
          )}

          {/* Scheduled / Recurring toggles – new expenses only */}
          {tab === 'expenses' && !editItem && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Scheduled payment toggle */}
              <Toggle on={fIsScheduled} onChange={v => { setFIsScheduled(v); if (v) setFIsRecurring(false) }} label="📅 תשלום עתידי (צ'ק / העברה מתוזמנת)" />
              {fIsScheduled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                  <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 500 }}>
                    💡 הקטגוריה, הסכום והספק שהזנת למעלה ישמרו. ניתן לשנות קטגוריה בעת סימון תשלום כנפרע.
                  </div>

                  <Input label="תאריך פירעון" type="date" value={fSchedDue || fDate} onChange={e => setFSchedDue(e.target.value)} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500 }}>אמצעי תשלום</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['check', 'transfer'] as const).map(m => (
                        <button key={m} type="button" onClick={() => setFSchedMethod(m)} style={{
                          flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
                          border: `2px solid ${fSchedMethod === m ? '#0369a1' : 'var(--border)'}`,
                          background: fSchedMethod === m ? '#e0f2fe' : '#fff',
                          color: fSchedMethod === m ? '#0369a1' : 'var(--text-muted)',
                        }}>
                          {m === 'check' ? "📝 צ'ק" : '🏦 העברה בנקאית'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder={fSchedMethod === 'check' ? "מס' צ'ק (אופציונלי)" : 'אסמכתא / מס׳ אסמכתא (אופציונלי)'}
                    value={fSchedRef}
                    onChange={e => setFSchedRef(e.target.value)}
                    style={{ ...SEL, width: '100%', background: '#fff' }}
                  />
                </div>
              )}

              {/* Recurring toggle */}
              {!fIsScheduled && (
                <>
                  <Toggle on={fIsRecurring} onChange={setFIsRecurring} label="🔁 הגדר כהוצאה קבועה (תתווסף אוטומטית)" />
                  {fIsRecurring && (
                    <div style={{ paddingRight: '44px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['monthly', 'bimonthly'] as const).map(f => (
                          <button key={f} type="button" onClick={() => setFRecurFreq(f)} style={{
                            padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                            border: `1px solid ${fRecurFreq === f ? 'var(--primary)' : 'var(--border)'}`,
                            background: fRecurFreq === f ? '#f0fdf4' : '#f8fafc',
                            color: fRecurFreq === f ? 'var(--primary)' : 'var(--text-muted)',
                          }}>{f === 'monthly' ? 'חודשי' : 'דו-חודשי'}</button>
                        ))}
                      </div>
                      <Toggle on={fRecurVar} onChange={setFRecurVar} label={fRecurVar ? 'סכום משתנה – תוזכר להזין בכל חודש' : 'סכום קבוע – יתווסף אוטומטית'} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ══ Recurring list modal ═══════════════════════════════════════════════ */}
      <Modal open={recListModal} onClose={() => setRecListModal(false)} title="🔁 ניהול הוצאות קבועות" maxWidth={680}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="sm" onClick={() => openRecForm()}>+ הוסף קבועה</Button>
          </div>
          {recurring.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '14px' }}>
              אין הוצאות קבועות. הוסף דרך &quot;+ הוסף הוצאה&quot; וסמן הגדר כקבועה, או לחץ הוסף קבועה למעלה.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={TH}>תיאור</th><th style={TH}>קטגוריה</th><th style={TH}>סכום</th><th style={TH}>תדירות</th><th style={TH}>יושם</th><th style={TH}>פעיל</th><th style={{ ...TH, width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {recurring.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', opacity: r.is_active ? 1 : 0.5 }}>
                    <td style={TD}>{r.description}</td>
                    <td style={TD}><span style={{ background: '#f1f5f9', borderRadius: '6px', padding: '2px 8px', fontSize: '11px' }}>{r.category}</span></td>
                    <td style={{ ...TD, fontWeight: 700, color: r.is_variable ? 'var(--warning)' : 'var(--danger)' }}>{r.is_variable ? 'משתנה' : fmt(Number(r.amount))}</td>
                    <td style={TD}>{r.frequency === 'monthly' ? 'חודשי' : 'דו-חודשי'}</td>
                    <td style={{ ...TD, fontSize: '12px', color: 'var(--text-muted)' }}>{r.last_applied ? monthLabel(r.last_applied) : 'עוד לא'}</td>
                    <td style={TD}>
                      <button onClick={() => toggleRecActive(r)} style={{ border: 'none', cursor: 'pointer', background: r.is_active ? 'var(--primary)' : '#e2e8f0', color: r.is_active ? '#fff' : 'var(--text-muted)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px' }}>
                        {r.is_active ? 'פעיל' : 'מושבת'}
                      </button>
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <button onClick={() => openRecForm(r)} style={ICON_BTN}>✏️</button>
                      <button onClick={() => delRec(r.id)}   style={ICON_BTN}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* ══ Add / Edit single recurring modal ════════════════════════════════ */}
      <Modal
        open={recFormModal}
        onClose={() => { setRecFormModal(false); setRecListModal(true) }}
        title={editRec ? 'עריכת הוצאה קבועה' : 'הוצאה קבועה חדשה'}
        maxWidth={460}
        footer={<><Button variant="secondary" onClick={() => { setRecFormModal(false); setRecListModal(true) }}>ביטול</Button><Button onClick={saveRec} loading={recSaving}>💾 שמור</Button></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="תיאור" placeholder="חשמל, שכירות..." value={rfDesc} onChange={e => setRfDesc(e.target.value)} />
          <CategorySelect
            label="קטגוריה"
            value={rfCat}
            onChange={setRfCat}
            cats={expCats}
            onAdd={name => addCategory('expense', name)}
            onDelete={name => deleteCategory('expense', name)}
          />
          <Toggle on={rfIsVar} onChange={setRfIsVar} label={rfIsVar ? 'סכום משתנה – תוזכר להזין' : 'סכום קבוע'} />
          {!rfIsVar && <Input label="סכום" type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={rfAmount} onChange={e => setRfAmount(e.target.value)} />}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['monthly', 'bimonthly'] as const).map(f => (
              <button key={f} type="button" onClick={() => setRfFreq(f)} style={{
                padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
                border: `1px solid ${rfFreq === f ? 'var(--primary)' : 'var(--border)'}`,
                background: rfFreq === f ? '#f0fdf4' : '#f8fafc',
                color: rfFreq === f ? 'var(--primary)' : 'var(--text-muted)',
              }}>{f === 'monthly' ? 'חודשי' : 'דו-חודשי'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>ספק (אופציונלי)</label>
            <select value={rfSupplier} onChange={e => setRfSupplier(e.target.value)} style={{ ...SEL, width: '100%' }}>
              <option value="">— ללא ספק —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* ══ Scheduled payments modal ══════════════════════════════════════════ */}
      {tenantIdRef.current && (
        <ScheduledPaymentsModal
          open={schedModal}
          onClose={() => setSchedModal(false)}
          suppliers={suppliers}
          tenantId={tenantIdRef.current}
          supabase={supabase}
          onRefresh={fetchData}
          showToast={showToast}
          expenseCats={expCats}
        />
      )}

      {/* ══ Variable recurring prompt ════════════════════════════════════════ */}
      {currentVar && (
        <Modal
          open={varModal}
          onClose={() => {}}
          title={`🔁 ${currentVar.description}`}
          maxWidth={400}
          footer={
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <Button variant="secondary" onClick={handleVarSkip} style={{ marginLeft: 'auto' }}>דלג לחודש זה</Button>
              <Button onClick={handleVarAdd} loading={varSaving}>✅ הוסף</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '10px 14px', background: '#fef9ec', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '13px', color: '#92400e' }}>
              הוצאה זו לא יושמה ל-{monthLabel(currentMonth)}. הזן סכום או לחץ &quot;דלג&quot;.
            </div>
            {pendingVars.length > 1 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pendingVars.length - 1} הוצאות נוספות ממתינות</div>
            )}
            <Input label={`סכום – ${currentVar.description}`} type="number" prefix="₪" placeholder="0.00" min="0" step="0.01" value={varAmount} onChange={e => setVarAmount(e.target.value)} autoFocus />
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
