'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import MoreMenu from '@/components/ui/MoreMenu'
import PageHeader from '@/components/ui/PageHeader'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { DEFAULT_YARD_MODULES, YARD_MONEY_KEY, YARD_SECTIONS } from '@/lib/yard/access'
import { guardedBackdrop } from '@/lib/ui/backdrop'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  tenant_id: string
  full_name: string
  phone: string | null
  email: string | null
  role: string | null
  salary_type: 'monthly' | 'hourly'
  base_salary: number | null
  hourly_rate: number | null
  is_active: boolean
  role_level: 'admin' | 'employee'
  bank_name: string | null
  bank_branch: string | null
  bank_account: string | null
  bank_holder: string | null
  id_number: string | null
  birth_date: string | null
  address: string | null
  shirt_size: string | null
  pants_size: string | null
  shoe_size: string | null
  payment_day: number | null
  start_date: string | null
  end_date: string | null
  notes: string | null
  yard_modules: string[] | null
  created_at: string
}

interface AdjItem { label: string; amount: number }

interface Salary {
  id: string
  employee_id: string
  month: string          // MM/YYYY
  base: number           // נטו תלוש (הסכום הנקי שמופיע בתלוש)
  hours: number
  additions: AdjItem[]   // תוספות חוץ תלוש
  deductions: AdjItem[]  // ניכויים חוץ תלוש
  total: number          // סה"כ = base + additions - deductions
  is_paid: boolean
  paid_date: string | null
  payment_method: string | null
  payment_ref: string | null
  expense_id: string | null
  notes: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['העברה', 'מזומן', "צ'ק"]
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

const ISRAELI_BANKS: { name: string; code: string }[] = [
  { name: 'בנק לאומי',                   code: '10' },
  { name: 'בנק דיסקונט',                 code: '11' },
  { name: 'בנק הפועלים',                 code: '12' },
  { name: 'בנק אגוד',                    code: '13' },
  { name: 'בנק אוצר החייל',              code: '14' },
  { name: 'בנק מרכנתיל דיסקונט',         code: '17' },
  { name: 'בנק מזרחי טפחות',             code: '20' },
  { name: 'סיטיבנק',                     code: '22' },
  { name: 'HSBC',                        code: '23' },
  { name: 'בנק יהב',                     code: '04' },
  { name: 'בנק הדואר',                   code: '09' },
  { name: 'בנק ירושלים',                 code: '54' },
  { name: 'הבנק הבינלאומי הראשון',        code: '31' },
  { name: 'בנק פועלי אגודת ישראל',        code: '13' },
  { name: 'ONE ZERO',                    code: '39' },
]

function fmt(n: number) {
  return '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0, useGrouping: true })
}

function currentPeriod(): string {
  const d = new Date()
  return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()
}

/** Convert "MM/YYYY" → "YYYY-MM" for date comparisons */
function periodYM(p: string): string {
  const [mm, yyyy] = p.split('/')
  return `${yyyy}-${mm}`
}

function buildPeriodList(): string[] {
  const list: string[] = []
  const d = new Date()
  for (let i = 0; i < 13; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    list.push(String(m.getMonth() + 1).padStart(2, '0') + '/' + m.getFullYear())
  }
  return list
}

function periodLabel(p: string): string {
  if (!p) return ''
  const [mm, yyyy] = p.split('/')
  const names = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return (names[parseInt(mm)] || mm) + ' ' + yyyy
}

function waLink(phone: string) {
  const clean = phone.replace(/\D/g, '')
  const num = clean.startsWith('0') ? '972' + clean.slice(1) : clean
  return `https://wa.me/${num}`
}

function calcTotal(net: number, additions: AdjItem[], deductions: AdjItem[]) {
  const adds = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const deds = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  return Math.max(0, net + adds - deds)
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column' }

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
  margin: '16px 0 8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px',
}

const thSt: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontWeight: 600,
  fontSize: '11px', color: 'var(--text-muted)', background: '#f8fafc',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', letterSpacing: '0.3px',
}

const tdSt: React.CSSProperties = {
  padding: '11px 12px', borderBottom: '1px solid #f1f5f9',
  fontSize: '13px', verticalAlign: 'middle',
}

// ── Empty form ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', role: '',
  salary_type: 'monthly' as 'monthly' | 'hourly',
  base_salary: '', hourly_rate: '',
  is_active: true, role_level: 'employee' as 'admin' | 'employee',
  bank_name: '', bank_branch: '', bank_account: '', bank_holder: '',
  start_date: '', end_date: '',
  id_number: '', birth_date: '', address: '',
  shirt_size: '', pants_size: '', shoe_size: '', payment_day: '', notes: '',
  yard_pin: '', yard_pin_remove: false, yard_modules: null as string[] | null,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EmployeesClient() {
  const sb = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantId = useRef('')
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const [myRole,    setMyRole]    = useState('')
  const [roleReady, setRoleReady] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [yardPinIds, setYardPinIds] = useState<Set<string>>(new Set())
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [period, setPeriod] = useState(currentPeriod())

  // Employee modal
  const [empModal, setEmpModal] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Adjustments modal (חוץ תלוש)
  const [adjModal, setAdjModal] = useState(false)
  const [adjEmpId, setAdjEmpId] = useState('')
  const [adjAdditions, setAdjAdditions] = useState<AdjItem[]>([])
  const [adjDeductions, setAdjDeductions] = useState<AdjItem[]>([])
  const [adjNotes, setAdjNotes] = useState('')

  // Pay modal
  const [payModal, setPayModal] = useState(false)
  const [payEmpId, setPayEmpId] = useState('')
  const [payMethod, setPayMethod] = useState('העברה')
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState('')
  const [paying, setPaying] = useState(false)

  // History modal
  const [histModal, setHistModal] = useState(false)
  const [histEmp, setHistEmp] = useState<Employee | null>(null)
  const [histRows, setHistRows] = useState<Salary[]>([])

  // Inline net salary editing
  const [netMap, setNetMap] = useState<Record<string, string>>({})

  // Quick bank/personal info view
  const [bankViewEmp, setBankViewEmp] = useState<Employee | null>(null)

  // Bank name dropdown
  const [showBankDrop, setShowBankDrop] = useState(false)
  const bankDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showBankDrop) return
    const handler = (e: MouseEvent) => {
      if (bankDropRef.current && !bankDropRef.current.contains(e.target as Node)) {
        setShowBankDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBankDrop])

  // ── Load ────────────────────────────────────────────────────────────────────

  const loadEmployees = useCallback(async () => {
    const { data } = await sb.from('employees')
      .select('*').eq('tenant_id', tenantId.current).order('full_name')
    if (data) setEmployees(data as Employee[])
    const r = await fetch('/api/employees/yard-pin')
    if (r.ok) setYardPinIds(new Set(await r.json() as string[]))
  }, [sb])

  const loadSalaries = useCallback(async () => {
    const { data } = await sb.from('salaries')
      .select('*').eq('tenant_id', tenantId.current)
    if (data) setSalaries(data as Salary[])
  }, [sb])

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      tenantId.current = profile.tenantId
      setMyRole(profile.role ?? '')
      setRoleReady(true)
      await loadEmployees()
      await loadSalaries()
    })()
  }, [profile, loadEmployees, loadSalaries])

  // Sync netMap from DB when period or salaries change
  useEffect(() => {
    const map: Record<string, string> = {}
    salaries.forEach(s => {
      if (s.month === period && s.base) map[s.employee_id] = String(s.base)
    })
    setNetMap(map)
  }, [salaries, period])

  // ── Salary helpers ───────────────────────────────────────────────────────────

  function salaryFor(empId: string) {
    return salaries.find(s => s.employee_id === empId && s.month === period)
  }

  async function ensureSalaryRec(emp: Employee): Promise<Salary> {
    const existing = salaryFor(emp.id)
    if (existing) return existing
    const newRec = {
      tenant_id: tenantId.current,
      employee_id: emp.id,
      month: period,
      base: 0,
      hours: 0,
      additions: [],
      deductions: [],
      total: 0,
      is_paid: false,
      paid_date: null,
      payment_method: null,
      payment_ref: null,
      expense_id: null,
      notes: null,
    }
    const { data } = await sb.from('salaries').insert(newRec).select().single()
    const created = data as Salary
    setSalaries(prev => [...prev, created])
    return created
  }

  // ── Auto-init salary records for all active employees ────────────────────────

  const [initingPeriod, setInitingPeriod] = useState(false)

  async function initPeriodRecords() {
    const tid = tenantId.current
    if (!tid) return
    setInitingPeriod(true)
    const missing = periodEmps.filter(e => !salaries.some(s => s.employee_id === e.id && s.month === period))
    if (missing.length === 0) { setInitingPeriod(false); return }
    const records = missing.map(e => ({
      id: crypto.randomUUID(),
      tenant_id: tid,
      employee_id: e.id,
      month: period,
      base: 0,
      hours: 0,
      additions: [],
      deductions: [],
      total: 0,
      is_paid: false,
      paid_date: null,
      payment_method: null,
      payment_ref: null,
      expense_id: null,
      notes: null,
    }))
    await sb.from('salaries').upsert(records, { onConflict: 'employee_id,month' })
    await loadSalaries()
    setInitingPeriod(false)
  }

  // ── Net salary inline save ───────────────────────────────────────────────────

  async function saveNet(emp: Employee) {
    const net = parseFloat(netMap[emp.id] || '0') || 0
    const sal = await ensureSalaryRec(emp)
    const total = calcTotal(net, sal.additions || [], sal.deductions || [])
    await sb.from('salaries').update({ base: net, total }).eq('id', sal.id)
    await loadSalaries()
  }

  // ── Employee CRUD ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditEmp(null)
    setForm({ ...EMPTY_FORM })
    setEmpModal(true)
  }

  function openEdit(e: Employee) {
    setEditEmp(e)
    setForm({
      full_name: e.full_name,
      phone: e.phone || '',
      email: e.email || '',
      role: e.role || '',
      salary_type: 'monthly',
      base_salary: e.base_salary != null ? String(e.base_salary) : '',
      hourly_rate: '',
      is_active: e.is_active,
      role_level: e.role_level || 'employee',
      bank_name: e.bank_name || '',
      bank_branch: e.bank_branch || '',
      bank_account: e.bank_account || '',
      bank_holder: e.bank_holder || '',
      id_number: e.id_number || '',
      birth_date: e.birth_date || '',
      address: e.address || '',
      shirt_size: e.shirt_size || '',
      pants_size: e.pants_size || '',
      shoe_size: e.shoe_size || '',
      payment_day: e.payment_day != null ? String(e.payment_day) : '',
      start_date: e.start_date || '',
      end_date: e.end_date || '',
      notes: e.notes || '',
      yard_pin: '', yard_pin_remove: false, yard_modules: e.yard_modules ?? null,
    })
    setEmpModal(true)
  }

  async function saveEmp() {
    if (!form.full_name.trim()) { showToast('נא להזין שם עובד', 'error'); return }
    if (!form.email.trim()) { showToast('נא להזין כתובת מייל', 'error'); return }
    if (form.yard_pin && !/^\d{4,8}$/.test(form.yard_pin)) { showToast('קוד כניסה לרחבה: 4–8 ספרות', 'error'); return }
    const rec = {
      tenant_id: tenantId.current,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim().toLowerCase(),
      role: form.role.trim() || null,
      salary_type: 'monthly' as const,
      base_salary: null,
      hourly_rate: null,
      is_active: form.is_active,
      role_level: form.role_level,
      bank_name: form.bank_name.trim() || null,
      bank_branch: form.bank_branch.trim() || null,
      bank_account: form.bank_account.trim() || null,
      bank_holder: form.bank_holder.trim() || null,
      id_number: form.id_number.trim() || null,
      birth_date: form.birth_date || null,
      address: form.address.trim() || null,
      shirt_size: form.shirt_size || null,
      pants_size: form.pants_size.trim() || null,
      shoe_size: form.shoe_size.trim() || null,
      payment_day: parseInt(form.payment_day) || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      yard_modules: form.yard_modules,
    }
    let empId = editEmp?.id ?? null
    if (editEmp) {
      await sb.from('employees').update(rec).eq('id', editEmp.id)
    } else {
      const { data } = await sb.from('employees').insert(rec).select('id').single()
      empId = data?.id ?? null
    }
    // Yard PIN goes through the server (hashed, never stored readable)
    if (empId && (form.yard_pin || form.yard_pin_remove)) {
      const r = await fetch('/api/employees/yard-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId, pin: form.yard_pin || null }),
      })
      if (!r.ok) showToast((await r.json().catch(() => null))?.error ?? 'שגיאה בשמירת קוד הרחבה', 'error')
    }
    showToast(editEmp ? 'עובד עודכן ✓' : 'עובד נוסף ✓', 'success')
    setEmpModal(false)
    loadEmployees()
  }

  async function deleteEmp(e: Employee) {
    const ok = await confirm({ msg: `למחוק את ${e.full_name}?`, icon: '🗑️' })
    if (!ok) return
    await sb.from('employees').delete().eq('id', e.id)
    showToast('עובד נמחק')
    loadEmployees()
  }

  async function sendInviteLink(email: string) {
    const res = await fetch('/api/employees/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) { showToast('שגיאה בשליחת ההזמנה', 'error'); return }
    showToast(`מייל הזמנה נשלח ל-${email} ✓`, 'success')
  }

  // ── Adjustments modal (חוץ תלוש) ────────────────────────────────────────────

  async function openAdj(emp: Employee) {
    const sal = await ensureSalaryRec(emp)
    setAdjEmpId(emp.id)
    setAdjAdditions(sal.additions?.length ? [...sal.additions] : [])
    setAdjDeductions(sal.deductions?.length ? [...sal.deductions] : [])
    setAdjNotes(sal.notes || '')
    setAdjModal(true)
  }

  async function saveAdj() {
    const emp = employees.find(e => e.id === adjEmpId)
    if (!emp) return
    const sal = salaryFor(emp.id)
    if (!sal) return
    const total = calcTotal(sal.base || 0, adjAdditions, adjDeductions)
    await sb.from('salaries').update({
      additions: adjAdditions,
      deductions: adjDeductions,
      notes: adjNotes || null,
      total,
    }).eq('id', sal.id)
    setAdjModal(false)
    loadSalaries()
    showToast('עודכן ✓', 'success')
  }

  function adjItem(list: AdjItem[], setList: (l: AdjItem[]) => void, i: number, f: 'label' | 'amount', val: string) {
    const next = [...list]
    next[i] = { ...next[i], [f]: f === 'amount' ? parseFloat(val) || 0 : val }
    setList(next)
  }

  // ── Pay modal ────────────────────────────────────────────────────────────────

  function openPay(empId: string) {
    setPayEmpId(empId)
    setPayMethod('העברה')
    setPayRef('')
    const [mm, yyyy] = period.split('/')
    const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0)
    setPayDate(lastDay.toISOString().split('T')[0])
    setPayModal(true)
  }

  async function confirmPay() {
    const emp = employees.find(e => e.id === payEmpId)
    if (!emp) return
    setPaying(true)
    const sal = await ensureSalaryRec(emp)
    const freshTotal = sal.is_paid
      ? sal.total
      : calcTotal(sal.base || 0, sal.additions || [], sal.deductions || [])

    const { data: cat } = await sb.from('expense_categories')
      .select('id').eq('tenant_id', tenantId.current).eq('name', 'שכר').maybeSingle()
    if (!cat) {
      await sb.from('expense_categories').insert({ tenant_id: tenantId.current, name: 'שכר' })
    }

    const { data: exp } = await sb.from('expenses').insert({
      tenant_id: tenantId.current,
      date: payDate,
      category: 'שכר',
      description: `משכורת – ${emp.full_name} – ${periodLabel(period)}`,
      amount: freshTotal,
      payment_method: payMethod,
      payment_ref: payRef.trim() || null,
    }).select('id').single()

    await sb.from('salaries').update({
      is_paid: true,
      total: freshTotal,
      paid_date: payDate,
      payment_method: payMethod,
      payment_ref: payRef.trim() || null,
      expense_id: exp?.id || null,
    }).eq('id', sal.id)

    setPaying(false)
    setPayModal(false)
    loadSalaries()
    showToast(`משכורת ${emp.full_name} שולמה ✓`, 'success')
  }

  // ── History modal ────────────────────────────────────────────────────────────

  async function openHistory(emp: Employee) {
    setHistEmp(emp)
    const { data } = await sb.from('salaries')
      .select('*').eq('employee_id', emp.id).order('month', { ascending: false })
    setHistRows((data || []) as Salary[])
    setHistModal(true)
  }

  async function unpay(sal: Salary) {
    const ok = await confirm({ msg: 'לבטל את התשלום?', icon: '↩️', confirmLabel: 'בטל תשלום', variant: 'danger' })
    if (!ok) return
    await sb.from('salaries').update({
      is_paid: false, paid_date: null, payment_method: null, payment_ref: null, expense_id: null,
    }).eq('id', sal.id)
    if (sal.expense_id) await sb.from('expenses').delete().eq('id', sal.expense_id)
    if (histEmp) {
      const { data } = await sb.from('salaries').select('*').eq('employee_id', histEmp.id).order('month', { ascending: false })
      setHistRows((data || []) as Salary[])
    }
    loadSalaries()
    showToast('תשלום בוטל')
  }

  // ── Derived stats ────────────────────────────────────────────────────────────

  const activeEmps = employees.filter(e => e.is_active)
  const periodEmps = activeEmps.filter(e =>
    !e.start_date || e.start_date.substring(0, 7) <= periodYM(period)
  )
  const curSals = salaries.filter(s => s.month === period)
  const totalPayroll = periodEmps.reduce((sum, e) => {
    const sal = curSals.find(s => s.employee_id === e.id)
    return sum + (sal ? (sal.total || 0) : 0)
  }, 0)
  const unpaidCount = periodEmps.filter(e => {
    const sal = curSals.find(s => s.employee_id === e.id)
    return !sal?.is_paid
  }).length

  // ── Render: employee cards ───────────────────────────────────────────────────

  // ── Print: all employees' additions/deductions for the period ────────────────

  function printAdjustments() {
    const rows = periodEmps
      .map(e => {
        const sal = salaryFor(e.id)
        const adds = sal?.additions || []
        const deds = sal?.deductions || []
        return {
          emp: e, adds, deds,
          addTotal: adds.reduce((s, a) => s + (Number(a.amount) || 0), 0),
          dedTotal: deds.reduce((s, d) => s + (Number(d.amount) || 0), 0),
        }
      })
      .filter(r => r.adds.length > 0 || r.deds.length > 0)

    if (!rows.length) { alert('אין תוספות או ניכויים חוץ תלוש לתקופה זו'); return }

    const grandAdd = rows.reduce((s, r) => s + r.addTotal, 0)
    const grandDed = rows.reduce((s, r) => s + r.dedTotal, 0)
    const bizName = profile?.tenant?.name || ''

    const rowsHtml = rows.map(r => `
      <tr>
        <td style="font-weight:700;text-align:right;padding:6px 8px;">${r.emp.full_name}</td>
        <td style="text-align:right;padding:6px 8px;">
          ${r.adds.length ? r.adds.map(a => `<div>${a.label}: <b>${fmt(a.amount)}</b></div>`).join('') : '<span style="color:#999">—</span>'}
        </td>
        <td style="text-align:right;padding:6px 8px;">
          ${r.deds.length ? r.deds.map(d => `<div>${d.label}: <b>${fmt(d.amount)}</b></div>`).join('') : '<span style="color:#999">—</span>'}
        </td>
        <td style="text-align:center;padding:6px 8px;color:#16a34a;font-weight:700;">${r.addTotal ? '+' + fmt(r.addTotal) : ''}</td>
        <td style="text-align:center;padding:6px 8px;color:#dc2626;font-weight:700;">${r.dedTotal ? '−' + fmt(r.dedTotal) : ''}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>תוספות וניכויים – ${periodLabel(period)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap');
@page { size: A4 portrait; margin: 12mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; font-size: 12px; }
h1 { font-size: 16px; font-weight: 900; margin-bottom: 2px; }
.sub { font-size: 12px; color: #555; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; }
th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; border: 1px solid #ccc; padding: 6px 8px; font-size: 11.5px; text-align: right; }
td { border: 1px solid #ccc; vertical-align: top; }
tfoot td { font-weight: 900; background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8px; }
</style>
</head>
<body>
  <h1>${bizName ? bizName + ' – ' : ''}תוספות וניכויים חוץ תלוש</h1>
  <div class="sub">תקופה: ${periodLabel(period)} &nbsp;|&nbsp; הודפס: ${new Date().toLocaleDateString('he-IL')}</div>
  <table>
    <thead><tr><th>עובד</th><th>תוספות</th><th>ניכויים</th><th style="width:80px">סה״כ תוספות</th><th style="width:80px">סה״כ ניכויים</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="3" style="text-align:left">סה״כ</td><td style="text-align:center;color:#16a34a">+${fmt(grandAdd)}</td><td style="text-align:center;color:#dc2626">−${fmt(grandDed)}</td></tr></tfoot>
  </table>
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('אפשר חלונות קופצים בדפדפן'); return }
    w.document.write(html)
    w.document.close()
  }

  // ── Render: salary table ─────────────────────────────────────────────────────

  function renderSalaryTable() {
    if (!periodEmps.length) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {employees.length ? 'אין עובדים פעילים בחודש זה' : 'לא הוגדרו עובדים עדיין'}
          {!employees.length && <div style={{ marginTop: 12 }}><Button onClick={openAdd}>+ הוסף עובד ראשון</Button></div>}
        </div>
      )
    }

    return (
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thSt}>עובד</th>
              <th style={{ ...thSt, minWidth: '140px' }}>נטו תלוש</th>
              <th style={thSt}>חוץ תלוש</th>
              <th style={thSt}>סה״כ לתשלום</th>
              <th style={thSt}>סטטוס</th>
              <th style={thSt}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {periodEmps.map(e => {
              const sal = salaryFor(e.id)
              const isPaid = sal?.is_paid || false
              const net = isPaid ? (sal?.base || 0) : (parseFloat(netMap[e.id] || '') || sal?.base || 0)
              const adds = (sal?.additions || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
              const deds = (sal?.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
              const total = isPaid ? (sal?.total || 0) : calcTotal(net, sal?.additions || [], sal?.deductions || [])
              const hasAdj = adds > 0 || deds > 0

              return (
                <tr key={e.id}>

                  {/* עובד */}
                  <td style={tdSt}>
                    <strong>{e.full_name}</strong>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {e.role && <span>{e.role}</span>}
                      {e.phone && <a href={waLink(e.phone)} target="_blank" rel="noreferrer" className="num" style={{ color: 'var(--text-muted)' }}>{e.phone}</a>}
                    </div>
                    {sal?.notes && <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: 2 }}>{sal.notes}</div>}
                  </td>

                  {/* נטו תלוש – inline editable */}
                  <td style={tdSt}>
                    {isPaid ? (
                      <span style={{ fontWeight: 700 }}>{fmt(sal?.base || 0)}</span>
                    ) : (
                      <input
                        type="number" min="0" step="1"
                        value={netMap[e.id] ?? (sal?.base || '')}
                        placeholder="הזן סכום..."
                        onChange={ev => setNetMap(prev => ({ ...prev, [e.id]: ev.target.value }))}
                        onBlur={() => saveNet(e)}
                        className="form-input"
                        style={{ width: '120px' }}
                      />
                    )}
                  </td>

                  {/* חוץ תלוש */}
                  <td style={tdSt}>
                    {isPaid ? (
                      hasAdj ? (
                        <div style={{ fontSize: '12px' }}>
                          {adds > 0 && <div style={{ color: 'var(--primary)' }}>+{fmt(adds)}</div>}
                          {deds > 0 && <div style={{ color: 'var(--danger)' }}>−{fmt(deds)}</div>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )
                    ) : (
                      <button
                        onClick={() => openAdj(e)}
                        style={{
                          background: hasAdj ? '#f0f9ff' : 'none',
                          border: hasAdj ? '1px solid #bae6fd' : '1px dashed var(--border)',
                          borderRadius: '6px', cursor: 'pointer', padding: '4px 8px',
                          fontSize: '12px', fontFamily: 'inherit', color: hasAdj ? '#0369a1' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                      >
                        {hasAdj ? (
                          <>
                            {adds > 0 && <span style={{ color: 'var(--primary)' }}>+{fmt(adds)}</span>}
                            {adds > 0 && deds > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
                            {deds > 0 && <span style={{ color: 'var(--danger)' }}>−{fmt(deds)}</span>}
                            <span style={{ color: 'var(--text-muted)' }}>✏️</span>
                          </>
                        ) : (
                          <span>+ הוסף</span>
                        )}
                      </button>
                    )}
                  </td>

                  {/* סה״כ */}
                  <td style={tdSt}>
                    <strong style={{ fontSize: '14px' }}>{fmt(total)}</strong>
                  </td>

                  {/* סטטוס */}
                  <td style={tdSt}>
                    {isPaid ? (
                      <div>
                        <span style={{ background: 'var(--success-soft)', color: 'var(--success)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                          שולם
                        </span>
                        {sal?.payment_method && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {sal.payment_method}{sal.payment_ref ? ` · ${sal.payment_ref}` : ''}
                          </div>
                        )}
                        {sal?.paid_date && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {new Date(sal.paid_date).toLocaleDateString('he-IL')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ background: 'var(--warning-soft)', color: 'var(--warning)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                        ממתין
                      </span>
                    )}
                  </td>

                  {/* פעולות */}
                  <td style={tdSt}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {!isPaid && (
                        <Button size="sm" variant="success" onClick={() => openPay(e.id)} disabled={!net && !sal?.base}>
                          שלם
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>ערוך פרטים</Button>
                      <RowActionsMenu align="end" actions={[
                        ...(isPaid && sal ? [{ key: 'unpay', label: 'בטל תשלום', icon: '↩️', onClick: () => unpay(sal) }] : []),
                        { key: 'hist', label: 'היסטוריית משכורות', icon: '📋', onClick: () => openHistory(e) },
                        { key: 'bank', label: 'פרטי בנק', icon: '🏦', onClick: () => setBankViewEmp(e) },
                        ...(e.email ? [{ key: 'invite', label: 'שלח הזמנה למערכת', icon: '🔗', onClick: () => sendInviteLink(e.email!) }] : []),
                        { key: 'delete', label: 'מחק עובד', icon: '🗑', danger: true, onClick: () => deleteEmp(e) },
                      ]} />
                    </div>
                  </td>

                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Render: summary bar (salary tab) ─────────────────────────────────────────

  function renderSalarySummary() {
    const paid = curSals.filter(s => periodEmps.some(e => e.id === s.employee_id) && s.is_paid)
      .reduce((sum, s) => sum + (s.total || 0), 0)
    const unpaid = totalPayroll - paid
    return (
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', alignItems: 'center' }}>
        <span>סה״כ: <strong>{fmt(totalPayroll)}</strong></span>
        <span style={{ color: 'var(--primary)' }}>שולם: <strong>{fmt(paid)}</strong></span>
        <span style={{ color: 'var(--warning)' }}>ממתין: <strong>{fmt(unpaid)}</strong></span>
      </div>
    )
  }

  // ── Directory view (non-admin) ───────────────────────────────────────────────

  if (!roleReady) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  if (myRole && myRole !== 'admin' && myRole !== 'super_admin') {
    const active = employees.filter(e => e.is_active)
    return (
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>📒 ספר טלפונים – עובדים</h2>
        {active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>אין עובדים פעילים</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '12px' }}>
          {active.map(e => (
            <div key={e.id} style={{
              background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
              padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', background: 'var(--primary)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '14px', flexShrink: 0,
              }}>
                {e.full_name.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{e.full_name}</div>
                {e.phone
                  ? <a href={`tel:${e.phone}`} style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none' }}>{e.phone}</a>
                  : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>אין טלפון</span>
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Excel ─────────────────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = employees.map(e => ({ שם: e.full_name, טלפון: e.phone ?? '', מייל: e.email ?? '', תפקיד: e.role ?? '', 'שכר נטו שגרתי': e.base_salary ?? '', 'תאריך התחלה': e.start_date ?? '', פעיל: e.is_active ? 'כן' : 'לא', הערות: e.notes ?? '' }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'עובדים')
    XLSX.writeFile(wb, 'עובדים.xlsx')
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        iconBg="linear-gradient(135deg,#8b5cf6,#a78bfa)"
        iconShadow="#8b5cf644"
        title="עובדים"
        subtitle="פרטי עובדים ומשכורות במקום אחד"
        actions={<>
          <Button onClick={openAdd}>+ הוסף עובד</Button>
          <MoreMenu excel={{ onExport: exportExcel }} actions={[
            { key: 'init', label: initingPeriod ? 'יוצר...' : 'אתחל חודש (רשומות שכר לכל העובדים)', icon: '🔄', disabled: initingPeriod, onClick: initPeriodRecords },
            { key: 'print', label: 'הדפס תוספות / ניכויים', icon: '🖨️', onClick: printAdjustments },
          ]} />
        </>}
      />

      {/* One screen: each employee's details + this period's salary (no inner tabs, 2026-10) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'עובדים פעילים', value: String(activeEmps.length) },
          { label: `משכורות ${periodLabel(period)}`, value: fmt(totalPayroll) },
          { label: 'ממתינים לתשלום', value: String(unpaidCount), tone: unpaidCount > 0 ? 'var(--warning)' : undefined },
        ].map(s => (
          <div key={s.label} className="kpi-tile">
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</span>
            <span className="num" style={{ fontSize: '22px', fontWeight: 700, color: s.tone ?? 'var(--text)' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <label htmlFor="emp-period" style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)' }}>חודש:</label>
        <select id="emp-period" value={period} onChange={e => setPeriod(e.target.value)} className="form-input" style={{ width: 'auto', margin: 0 }}>
          {buildPeriodList().map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        {renderSalarySummary()}
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        מזינים את הנטו מהתלוש; תוספות וניכויים חוץ תלוש (בונוס, קנס) נכנסים בעמודה שלהם ומתווספים לסכום לתשלום.
      </p>

      {renderSalaryTable()}

      {/* Employees not active in this period (left, not started yet, or turned off) */}
      {(() => {
        const others = employees.filter(e => !periodEmps.some(p => p.id === e.id))
        if (!others.length) return null
        return (
          <details style={{ marginTop: '18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13.5px' }}>עובדים לא פעילים בחודש זה ({others.length})</summary>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {others.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{e.full_name}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginInlineStart: 8 }}>{e.role ?? ''}{e.is_active ? '' : ' · לא פעיל'}</span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>ערוך פרטים</Button>
                  <RowActionsMenu align="end" actions={[
                    { key: 'hist', label: 'היסטוריית משכורות', icon: '📋', onClick: () => openHistory(e) },
                    { key: 'delete', label: 'מחק עובד', icon: '🗑', danger: true, onClick: () => deleteEmp(e) },
                  ]} />
                </div>
              ))}
            </div>
          </details>
        )
      })()}

      {/* ── Employee Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={empModal}
        onClose={() => setEmpModal(false)}
        title={editEmp ? 'עריכת עובד' : 'עובד חדש'}
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmpModal(false)}>ביטול</Button>
            <Button onClick={saveEmp}>שמור</Button>
          </>
        }
      >
        {/* Basic fields */}
        <div style={grid2}>
          <div style={field}>
            <label className="form-label">שם מלא *</label>
            <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="ישראל ישראלי" />
          </div>
          <div style={field}>
            <label className="form-label">תפקיד</label>
            <input className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="מכונאי, מוכר..." />
          </div>
          <div style={field}>
            <label className="form-label">מייל *</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
          </div>
          <div style={field}>
            <label className="form-label">טלפון</label>
            <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="050-0000000" />
          </div>
          <div style={field}>
            <label className="form-label">יום תשלום בחודש</label>
            <input
              className="form-input" type="number" min="1" max="31" placeholder="למשל 10"
              value={form.payment_day}
              onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
            />
          </div>
          <div style={field}>
            <label className="form-label">תאריך תחילת עבודה</label>
            <input className="form-input" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div style={field}>
            <label className="form-label">תאריך סיום עבודה <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(ריק = פעיל)</span></label>
            <input className="form-input" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div style={{ ...field }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '9px', border: '1.5px solid var(--border)' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>עובד פעיל (גישה למערכת)</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span className="toggle-track" />
              </label>
            </div>
          </div>
          <div style={{ ...field, gridColumn: '1/-1' }}>
            <label className="form-label">הערות</label>
            <textarea className="form-input" style={{ resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        {/* Yard terminal login */}
        {(() => {
          const hasPin = !!editEmp && yardPinIds.has(editEmp.id) && !form.yard_pin_remove
          const mods = form.yard_modules ?? DEFAULT_YARD_MODULES
          const toggleMod = (k: string) => setForm(f => {
            const cur = f.yard_modules ?? DEFAULT_YARD_MODULES
            return { ...f, yard_modules: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k] }
          })
          return (
            <details open style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <summary style={{ cursor: 'pointer', padding: '10px 14px', fontWeight: 700, fontSize: '13px', background: '#f8fafc', userSelect: 'none' }}>
                🔧 כניסה למסוף רחבה {hasPin || form.yard_pin ? '· ✓ יש קוד' : '· אין קוד'}
              </summary>
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  ברחבה העובד בוחר את השם שלו ומקליד את הקוד. עובד בלי קוד לא מופיע ברשימה.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ ...field, flex: '1 1 180px' }}>
                    <label className="form-label">{hasPin ? 'קוד חדש (ריק = להשאיר את הקיים)' : 'קוד כניסה (4–8 ספרות)'}</label>
                    <input className="form-input" inputMode="numeric" autoComplete="off" maxLength={8} placeholder="למשל 1234"
                      value={form.yard_pin}
                      onChange={e => setForm(f => ({ ...f, yard_pin: e.target.value.replace(/\D/g, ''), yard_pin_remove: false }))} />
                  </div>
                  {hasPin && (
                    <Button variant="secondary" onClick={() => setForm(f => ({ ...f, yard_pin: '', yard_pin_remove: true }))}>בטל קוד</Button>
                  )}
                  {form.yard_pin_remove && <span style={{ fontSize: '12.5px', color: 'var(--danger)' }}>הקוד יבוטל בשמירה</span>}
                </div>
                <div>
                  <div className="form-label" style={{ marginBottom: '6px' }}>מה העובד רואה ברחבה</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                    {[...YARD_SECTIONS.map(x => ({ key: x.key as string, label: `${x.icon} ${x.label}` })), { key: YARD_MONEY_KEY, label: '💰 סכומים בדוחות' }].map(o => (
                      <label key={o.key} style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={mods.includes(o.key)} onChange={() => toggleMod(o.key)} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )
        })()}

        {/* Bank details */}
        <details style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '10px 14px', fontWeight: 700, fontSize: '13px', background: '#f8fafc', userSelect: 'none' }}>
            💳 פרטי חשבון בנק
          </summary>
          <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={field}>
              <label className="form-label">שם בנק</label>
              <div ref={bankDropRef} style={{ position: 'relative' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    value={form.bank_name}
                    placeholder="התחל להקליד..."
                    onFocus={() => setShowBankDrop(true)}
                    onChange={e => { setForm(f => ({ ...f, bank_name: e.target.value })); setShowBankDrop(true) }}
                  />
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setShowBankDrop(v => !v) }}
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: '32px', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: '10px', color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >▼</button>
                  {ISRAELI_BANKS.find(b => b.name === form.bank_name) && (
                    <span style={{
                      position: 'absolute', left: '36px',
                      background: '#e8f5ee', color: 'var(--primary)',
                      fontSize: '11px', fontWeight: 700,
                      padding: '2px 6px', borderRadius: '6px', pointerEvents: 'none',
                    }}>
                      {ISRAELI_BANKS.find(b => b.name === form.bank_name)!.code}
                    </span>
                  )}
                </div>
                {showBankDrop && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 200,
                    background: '#fff', border: '1px solid var(--border)',
                    borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                    maxHeight: '200px', overflowY: 'auto', marginTop: '2px',
                  }}>
                    {ISRAELI_BANKS
                      .filter(b => !form.bank_name || b.name.includes(form.bank_name) || form.bank_name === b.name)
                      .map(b => (
                        <div
                          key={b.code}
                          onMouseDown={e => {
                            e.preventDefault()
                            setForm(f => ({ ...f, bank_name: b.name }))
                            setShowBankDrop(false)
                          }}
                          style={{
                            padding: '9px 12px', cursor: 'pointer', fontSize: '13px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: form.bank_name === b.name ? 'var(--success-soft)' : undefined,
                          }}
                        >
                          <span>{b.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{b.code}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div style={field}>
              <label className="form-label">מספר סניף</label>
              <input className="form-input" value={form.bank_branch} placeholder="123" onChange={e => setForm(f => ({ ...f, bank_branch: e.target.value }))} />
            </div>
            <div style={field}>
              <label className="form-label">מספר חשבון</label>
              <input className="form-input" value={form.bank_account} placeholder="12345678" onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} />
            </div>
            <div style={field}>
              <label className="form-label">שם בעל החשבון</label>
              <input className="form-input" value={form.bank_holder} placeholder="אם שונה מהעובד" onChange={e => setForm(f => ({ ...f, bank_holder: e.target.value }))} />
            </div>
          </div>
        </details>

        {/* Personal details */}
        <details style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '10px 14px', fontWeight: 700, fontSize: '13px', background: '#f8fafc', userSelect: 'none' }}>
            👤 פרטים אישיים
          </summary>
          <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={field}>
              <label className="form-label">מספר ת.ז.</label>
              <input className="form-input" value={form.id_number} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} placeholder="000000000" />
            </div>
            <div style={field}>
              <label className="form-label">תאריך לידה</label>
              <input className="form-input" type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
            </div>
            <div style={{ ...field, gridColumn: '1/-1' }}>
              <label className="form-label">כתובת מגורים</label>
              <input className="form-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="רחוב, מספר, עיר" />
            </div>
            <div style={field}>
              <label className="form-label">מידת חולצה</label>
              <select className="form-input" value={form.shirt_size} onChange={e => setForm(f => ({ ...f, shirt_size: e.target.value }))}>
                <option value="">—</option>
                {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={field}>
              <label className="form-label">מידת מכנסיים</label>
              <input className="form-input" value={form.pants_size} onChange={e => setForm(f => ({ ...f, pants_size: e.target.value }))} placeholder="32, 34, L..." />
            </div>
            <div style={field}>
              <label className="form-label">מידת נעליים</label>
              <input className="form-input" value={form.shoe_size} onChange={e => setForm(f => ({ ...f, shoe_size: e.target.value }))} placeholder="42" />
            </div>
          </div>
        </details>
      </Modal>

      {/* ── Adjustments Modal (חוץ תלוש) ──────────────────────────────────────── */}
      <Modal
        open={adjModal}
        onClose={() => setAdjModal(false)}
        title={`תוספות וניכויים חוץ תלוש – ${employees.find(e => e.id === adjEmpId)?.full_name || ''} – ${periodLabel(period)}`}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjModal(false)}>ביטול</Button>
            <Button onClick={saveAdj}>שמור</Button>
          </>
        }
      >
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', marginTop: 0 }}>
          פריטים אלו מתווספים / מנוכים מהנטו שהוזן בתלוש — לא כולל בתלוש עצמו.
        </p>

        <p style={sectionTitle}>➕ תוספות חוץ תלוש</p>
        {adjAdditions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="בונוס, נסיעות..." value={a.label}
              onChange={e => adjItem(adjAdditions, setAdjAdditions, i, 'label', e.target.value)} />
            <input className="form-input" style={{ width: '90px' }} type="number" min="0" step="1" placeholder="₪" value={a.amount || ''}
              onChange={e => adjItem(adjAdditions, setAdjAdditions, i, 'amount', e.target.value)} />
            <button onClick={() => setAdjAdditions(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setAdjAdditions(prev => [...prev, { label: '', amount: 0 }])}>+ הוסף תוספת</Button>

        <p style={{ ...sectionTitle, marginTop: '20px' }}>➖ ניכויים חוץ תלוש</p>
        {adjDeductions.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="ניכוי, קנס..." value={d.label}
              onChange={e => adjItem(adjDeductions, setAdjDeductions, i, 'label', e.target.value)} />
            <input className="form-input" style={{ width: '90px' }} type="number" min="0" step="1" placeholder="₪" value={d.amount || ''}
              onChange={e => adjItem(adjDeductions, setAdjDeductions, i, 'amount', e.target.value)} />
            <button onClick={() => setAdjDeductions(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setAdjDeductions(prev => [...prev, { label: '', amount: 0 }])}>+ הוסף ניכוי</Button>

        <div style={{ marginTop: '16px' }}>
          <label className="form-label">הערות</label>
          <input className="form-input" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="הערה..." />
        </div>

        {/* Preview total */}
        {(() => {
          const sal = salaryFor(adjEmpId)
          const net = sal?.base || 0
          const addTotal = adjAdditions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
          const dedTotal = adjDeductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
          const preview = calcTotal(net, adjAdditions, adjDeductions)
          return net > 0 ? (
            <div style={{ marginTop: '16px', background: 'var(--success-soft)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                נטו תלוש: {fmt(net)}
                {addTotal > 0 && <> + תוספות: {fmt(addTotal)}</>}
                {dedTotal > 0 && <> − ניכויים: {fmt(dedTotal)}</>}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '14px' }}>
                סה״כ לתשלום: {fmt(preview)}
              </div>
            </div>
          ) : null
        })()}
      </Modal>

      {/* ── Pay Modal ─────────────────────────────────────────────────────────── */}
      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title={`תשלום משכורת – ${employees.find(e => e.id === payEmpId)?.full_name || ''}`}
        maxWidth={380}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>ביטול</Button>
            <Button variant="success" onClick={confirmPay} loading={paying}>אישור תשלום</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={field}>
            <label className="form-label">אמצעי תשלום</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {PAYMENT_METHODS.map(m => (
                <button key={m} onClick={() => setPayMethod(m)} style={{
                  flex: 1, padding: '9px 6px', borderRadius: '8px', border: '1.5px solid',
                  cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                  borderColor: payMethod === m ? 'var(--primary)' : 'var(--border)',
                  background: payMethod === m ? 'var(--primary)' : '#fff',
                  color: payMethod === m ? '#fff' : 'var(--text)',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div style={field}>
            <label className="form-label">אסמכתא (אופציונלי)</label>
            <input className="form-input" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="מספר צ'ק / אסמכתא העברה..." />
          </div>
          <div style={field}>
            <label className="form-label">תאריך תשלום (יירשם כהוצאה)</label>
            <input className="form-input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
          {/* Breakdown */}
          {(() => {
            const sal = salaryFor(payEmpId)
            const net = sal?.base || 0
            const adds = (sal?.additions || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
            const deds = (sal?.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
            const total = calcTotal(net, sal?.additions || [], sal?.deductions || [])
            return (
              <div style={{ background: 'var(--success-soft)', padding: '12px 14px', borderRadius: '8px', fontSize: '13px' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>נטו תלוש: <strong>{fmt(net)}</strong></div>
                {adds > 0 && <div style={{ color: 'var(--primary)', marginBottom: '4px' }}>+ תוספות חוץ תלוש: {fmt(adds)}</div>}
                {deds > 0 && <div style={{ color: 'var(--danger)', marginBottom: '4px' }}>− ניכויים חוץ תלוש: {fmt(deds)}</div>}
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', borderTop: '1px solid #bbf7d0', paddingTop: '8px', marginTop: '4px' }}>
                  סה״כ לתשלום: {fmt(total)}
                </div>
              </div>
            )
          })()}
        </div>
      </Modal>

      {/* ── History Modal ─────────────────────────────────────────────────────── */}
      <Modal
        open={histModal}
        onClose={() => setHistModal(false)}
        title={`היסטוריית שכר – ${histEmp?.full_name || ''}`}
        maxWidth={600}
        footer={<Button variant="secondary" onClick={() => setHistModal(false)}>סגור</Button>}
      >
        {histRows.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>אין רישומי שכר</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={thSt}>תקופה</th>
                  <th style={thSt}>נטו תלוש</th>
                  <th style={thSt}>חוץ תלוש</th>
                  <th style={thSt}>סה״כ</th>
                  <th style={thSt}>אמצעי תשלום</th>
                  <th style={thSt}>תאריך</th>
                  <th style={thSt}>סטטוס</th>
                  <th style={thSt}></th>
                </tr>
              </thead>
              <tbody>
                {histRows.filter(s => (s.total || 0) > 0 || s.is_paid).map(s => {
                  const adds = (s.additions || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
                  const deds = (s.deductions || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
                  return (
                    <tr key={s.id} style={{ background: s.is_paid ? 'var(--success-soft)' : undefined }}>
                      <td style={tdSt}><strong>{periodLabel(s.month)}</strong></td>
                      <td style={tdSt}>{fmt(s.base || 0)}</td>
                      <td style={tdSt}>
                        {(adds > 0 || deds > 0) ? (
                          <div style={{ fontSize: '12px' }}>
                            {adds > 0 && <div style={{ color: 'var(--primary)' }}>+{fmt(adds)}</div>}
                            {deds > 0 && <div style={{ color: 'var(--danger)' }}>−{fmt(deds)}</div>}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={tdSt}><strong>{fmt(s.total || 0)}</strong></td>
                      <td style={tdSt}>{s.payment_method || '—'}</td>
                      <td style={tdSt}>{s.paid_date ? new Date(s.paid_date).toLocaleDateString('he-IL') : '—'}</td>
                      <td style={tdSt}>
                        {s.is_paid ? (
                          <span style={{ background: 'var(--success-soft)', color: 'var(--success)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>✅ שולם</span>
                        ) : (
                          <span style={{ background: '#fff7ed', color: 'var(--warning)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>⏳ ממתין</span>
                        )}
                      </td>
                      <td style={tdSt}>
                        {s.is_paid && (
                          <Button size="sm" variant="ghost" onClick={() => unpay(s)} title="בטל תשלום">↩️</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* ── Bank / Personal Quick View ──────────────────────────────────────────── */}
      {bankViewEmp && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          {...guardedBackdrop(() => setBankViewEmp(null))}
        >
          <div
            style={{ background: '#fff', borderRadius: 'var(--radius)', padding: '24px', width: 'min(480px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 60px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)', direction: 'rtl' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>🏦 פרטי בנק ואישי – {bankViewEmp.full_name}</h3>
              <button onClick={() => setBankViewEmp(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {(bankViewEmp.bank_name || bankViewEmp.bank_account) ? (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>פרטי חשבון בנק</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  {bankViewEmp.bank_name && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>בנק</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.bank_name}</div>
                    </div>
                  )}
                  {bankViewEmp.bank_branch && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>סניף</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.bank_branch}</div>
                    </div>
                  )}
                  {bankViewEmp.bank_account && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>מספר חשבון</div>
                      <div style={{ fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>{bankViewEmp.bank_account}</div>
                    </div>
                  )}
                  {bankViewEmp.bank_holder && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>שם בעל החשבון</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.bank_holder}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px', background: 'var(--bg)', borderRadius: '8px', marginBottom: '14px', textAlign: 'center' }}>
                לא הוזנו פרטי בנק לעובד זה
              </div>
            )}

            {(bankViewEmp.id_number || bankViewEmp.birth_date || bankViewEmp.address) && (
              <div style={{ background: '#f9fafb', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>פרטים אישיים</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  {bankViewEmp.id_number && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>תעודת זהות</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.id_number}</div>
                    </div>
                  )}
                  {bankViewEmp.birth_date && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>תאריך לידה</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.birth_date}</div>
                    </div>
                  )}
                  {bankViewEmp.address && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>כתובת</div>
                      <div style={{ fontWeight: 700 }}>{bankViewEmp.address}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                onClick={() => { openEdit(bankViewEmp); setBankViewEmp(null) }}
                style={{ padding: '8px 20px', background: 'var(--bg-soft)', color: 'var(--success)', border: '1.5px solid #bbf7d0', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >עריכה מלאה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
