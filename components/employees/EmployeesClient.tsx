'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

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
  created_at: string
}

interface AdjItem { label: string; amount: number }

interface Salary {
  id: string
  employee_id: string
  month: string          // MM/YYYY
  base: number
  hours: number
  additions: AdjItem[]
  deductions: AdjItem[]
  total: number
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

function calcTotal(base: number, hours: number, payType: string, additions: AdjItem[], deductions: AdjItem[]) {
  const baseAmt = payType === 'hourly' ? base * hours : base
  const adds = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const deds = deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  return Math.max(0, baseAmt + adds - deds)
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', width: '100%',
  boxSizing: 'border-box', direction: 'rtl', background: 'var(--bg)',
  fontFamily: 'inherit',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: '4px',
}

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
  padding: '10px 12px', textAlign: 'right', fontWeight: 700,
  fontSize: '12px', color: 'var(--text-muted)', background: '#f8fafc',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}

const tdSt: React.CSSProperties = {
  padding: '11px 12px', borderBottom: '1px solid var(--border)',
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
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EmployeesClient() {
  const sb = useRef(createClient()).current
  const tenantId = useRef('')
  const { showToast } = useToast()
  const { confirm } = useConfirm()

  const [myRole,    setMyRole]    = useState('')
  const [roleReady, setRoleReady] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [tab, setTab] = useState<'employees' | 'salaries'>('employees')
  const [period, setPeriod] = useState(currentPeriod())

  // Employee modal
  const [empModal, setEmpModal] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Adjustments modal
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

  // Local hours state for hourly employees (inline editing)
  const [hoursMap, setHoursMap] = useState<Record<string, string>>({})

  // Salary table edit mode
  const [salaryEditMode, setSalaryEditMode] = useState(false)

  // Employee card 3-dots open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Bank name dropdown
  const [showBankDrop, setShowBankDrop] = useState(false)
  const bankDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenuId) return
    const handler = () => setOpenMenuId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId])

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
  }, [sb])

  const loadSalaries = useCallback(async () => {
    const { data } = await sb.from('salaries')
      .select('*').eq('tenant_id', tenantId.current)
    if (data) setSalaries(data as Salary[])
  }, [sb])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id, role').eq('id', user.id).single()
      if (!profile) return
      tenantId.current = profile.tenant_id
      setMyRole(profile.role ?? '')
      setRoleReady(true)
      await loadEmployees()
      await loadSalaries()
    })()
  }, [sb, loadEmployees, loadSalaries])

  // Sync hoursMap from DB when period or salaries change
  useEffect(() => {
    const map: Record<string, string> = {}
    salaries.forEach(s => {
      if (s.month === period && s.hours) map[s.employee_id] = String(s.hours)
    })
    setHoursMap(map)
  }, [salaries, period])

  // ── Salary helpers ───────────────────────────────────────────────────────────

  function salaryFor(empId: string) {
    return salaries.find(s => s.employee_id === empId && s.month === period)
  }

  async function ensureSalaryRec(emp: Employee): Promise<Salary> {
    const existing = salaryFor(emp.id)
    if (existing) return existing
    const base = emp.salary_type === 'monthly' ? (emp.base_salary || 0) : (emp.hourly_rate || 0)
    const newRec = {
      tenant_id: tenantId.current,
      employee_id: emp.id,
      month: period,
      base,
      hours: 0,
      additions: [],
      deductions: [],
      total: emp.salary_type === 'monthly' ? base : 0,
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
      base: e.salary_type === 'monthly' ? (e.base_salary || 0) : (e.hourly_rate || 0),
      hours: 0,
      additions: [],
      deductions: [],
      total: e.salary_type === 'monthly' ? (e.base_salary || 0) : 0,
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

  // ── Hours (hourly employees) ─────────────────────────────────────────────────

  async function saveHours(emp: Employee) {
    const hours = parseFloat(hoursMap[emp.id] || '0') || 0
    const sal = await ensureSalaryRec(emp)
    const effectiveBase = emp.salary_type === 'monthly' ? (emp.base_salary || 0) : (sal.base || emp.hourly_rate || 0)
    const total = calcTotal(effectiveBase, hours, emp.salary_type, sal.additions || [], sal.deductions || [])
    await sb.from('salaries').update({ hours, total }).eq('id', sal.id)
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
      salary_type: e.salary_type || 'monthly',
      base_salary: e.base_salary != null ? String(e.base_salary) : '',
      hourly_rate: e.hourly_rate != null ? String(e.hourly_rate) : '',
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
    })
    setEmpModal(true)
  }

  async function saveEmp() {
    if (!form.full_name.trim()) { showToast('נא להזין שם עובד', 'error'); return }
    if (!form.email.trim()) { showToast('נא להזין כתובת מייל', 'error'); return }
    const rec = {
      tenant_id: tenantId.current,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim().toLowerCase(),
      role: form.role.trim() || null,
      salary_type: form.salary_type,
      base_salary: parseFloat(form.base_salary) || null,
      hourly_rate: parseFloat(form.hourly_rate) || null,
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
    }
    if (editEmp) {
      await sb.from('employees').update(rec).eq('id', editEmp.id)
      showToast('עובד עודכן ✓', 'success')
    } else {
      await sb.from('employees').insert(rec)
      showToast('עובד נוסף ✓', 'success')
    }
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

  // ── Adjustments modal ────────────────────────────────────────────────────────

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
    const effectiveBase = emp.salary_type === 'monthly' ? (emp.base_salary || 0) : (sal.base || emp.hourly_rate || 0)
    const total = calcTotal(effectiveBase, sal.hours || 0, emp.salary_type, adjAdditions, adjDeductions)
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

  function adjItem(list: AdjItem[], setList: (l: AdjItem[]) => void, i: number, field: 'label' | 'amount', val: string) {
    const next = [...list]
    next[i] = { ...next[i], [field]: field === 'amount' ? parseFloat(val) || 0 : val }
    setList(next)
  }

  // ── Pay modal ────────────────────────────────────────────────────────────────

  function openPay(empId: string) {
    setPayEmpId(empId)
    setPayMethod('העברה')
    setPayRef('')
    // Default date = last day of the salary period month
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

    // Recalculate total using current employee base (in case salary was updated after record creation)
    const effectiveBase = emp.salary_type === 'monthly' ? (emp.base_salary || 0) : (sal.base || emp.hourly_rate || 0)
    const freshTotal = sal.is_paid ? sal.total : calcTotal(effectiveBase, sal.hours || 0, emp.salary_type, sal.additions || [], sal.deductions || [])

    // Ensure "שכר" category exists
    const { data: cat } = await sb.from('expense_categories')
      .select('id').eq('tenant_id', tenantId.current).eq('name', 'שכר').maybeSingle()
    if (!cat) {
      await sb.from('expense_categories').insert({ tenant_id: tenantId.current, name: 'שכר' })
    }

    // Create expense record
    const { data: exp } = await sb.from('expenses').insert({
      tenant_id: tenantId.current,
      date: payDate,
      category: 'שכר',
      description: `משכורת – ${emp.full_name} – ${periodLabel(period)}`,
      amount: freshTotal,
      payment_method: payMethod,
      payment_ref: payRef.trim() || null,
    }).select('id').single()

    // Mark salary as paid (also update total to freshTotal to keep record consistent)
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
  // Only show employees who have started by the selected period
  const periodEmps = activeEmps.filter(e =>
    !e.start_date || e.start_date.substring(0, 7) <= periodYM(period)
  )
  const curSals = salaries.filter(s => s.month === period)
  const totalPayroll = periodEmps.reduce((sum, e) => {
    const sal = curSals.find(s => s.employee_id === e.id)
    const base = e.salary_type === 'monthly' ? (e.base_salary || 0) : 0
    return sum + (sal ? (sal.total || 0) : base)
  }, 0)
  const unpaidCount = periodEmps.filter(e => {
    const sal = curSals.find(s => s.employee_id === e.id)
    return !sal?.is_paid
  }).length

  // ── Render: employee cards ───────────────────────────────────────────────────

  function renderEmpCards() {
    if (!employees.length) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👷</div>
          <p>לא הוגדרו עובדים עדיין</p>
          <Button onClick={openAdd} style={{ marginTop: '12px' }}>+ הוסף עובד ראשון</Button>
        </div>
      )
    }

    const sorted = [...employees].sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
        {sorted.map(e => (
          <div key={e.id} style={{
            background: '#fff', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', padding: '18px',
            borderRight: `4px solid ${e.is_active ? 'var(--primary)' : 'var(--border)'}`,
            opacity: e.is_active ? 1 : 0.7,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '15px' }}>👷 {e.full_name}</div>
                {e.role && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{e.role}</div>}
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '2px 8px',
                borderRadius: '10px', whiteSpace: 'nowrap', alignSelf: 'flex-start',
                background: e.is_active ? '#dcfce7' : '#f1f5f9',
                color: e.is_active ? '#16a34a' : 'var(--text-muted)',
              }}>
                {e.is_active ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>

            {/* Contact */}
            {e.phone && (
              <a href={waLink(e.phone)} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#25d366', marginBottom: '5px', textDecoration: 'none' }}>
                📞 {e.phone}
              </a>
            )}
            {e.email && (
              <a href={`mailto:${e.email}`}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--accent)', marginBottom: '5px', textDecoration: 'none' }}>
                ✉️ {e.email}
              </a>
            )}

            {/* Salary info */}
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
              {e.salary_type === 'hourly'
                ? `₪${(e.hourly_rate || 0).toLocaleString('he-IL')} לשעה`
                : `₪${(e.base_salary || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })} לחודש`}
            </div>

            {/* Actions – 3-dots menu */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', position: 'relative' }}>
              <button
                onClick={ev => { ev.stopPropagation(); setOpenMenuId(openMenuId === e.id ? null : e.id) }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', padding: '4px 10px', fontSize: '18px', color: 'var(--text-muted)', lineHeight: 1 }}
                title="אפשרויות"
              >⋮</button>
              {openMenuId === e.id && (
                <div
                  onClick={ev => ev.stopPropagation()}
                  style={{
                    position: 'absolute', bottom: '100%', left: 0, zIndex: 100,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0,0,0,.12)', minWidth: '160px', overflow: 'hidden',
                    marginBottom: '4px',
                  }}
                >
                  {[
                    { label: '✏️ עריכה', action: () => { openEdit(e); setOpenMenuId(null) } },
                    ...(e.email ? [{ label: '🔗 שלח הזמנה', action: () => { sendInviteLink(e.email!); setOpenMenuId(null) } }] : []),
                    { label: '📋 היסטוריה', action: () => { openHistory(e); setOpenMenuId(null) } },
                    { label: '🗑️ מחק', action: () => { deleteEmp(e); setOpenMenuId(null) }, danger: true },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      style={{
                        display: 'block', width: '100%', textAlign: 'right', padding: '10px 14px',
                        border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px',
                        color: (item as { danger?: boolean }).danger ? 'var(--danger)' : 'var(--text)',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >{item.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Render: salary table ─────────────────────────────────────────────────────

  function renderSalaryTable() {
    if (!periodEmps.length) {
      return <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>אין עובדים פעילים לתקופה זו</div>
    }

    return (
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={thSt}>עובד</th>
              <th style={thSt}>שכר בסיס</th>
              <th style={thSt}>שעות</th>
              <th style={thSt}>תוספות</th>
              <th style={thSt}>ניכויים</th>
              <th style={thSt}>סה״כ</th>
              <th style={thSt}>סטטוס</th>
              <th style={thSt}>שלם</th>
              {salaryEditMode && <th style={thSt}>עריכה</th>}
            </tr>
          </thead>
          <tbody>
            {periodEmps.map(e => {
              const sal = salaryFor(e.id)
              // Monthly: always use current employee salary (not snapshot in sal.base)
              // Hourly: use sal.base (rate at time of record creation) or current rate
              const base = e.salary_type === 'monthly'
                ? (e.base_salary ?? 0)
                : (sal?.base ?? e.hourly_rate ?? 0)
              const hours = parseFloat(hoursMap[e.id] || String(sal?.hours || 0)) || 0
              const adds = (sal?.additions || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
              const deds = (sal?.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
              const displayBase = e.salary_type === 'hourly'
                ? `₪${base.toLocaleString('he-IL')} × ${hours}שע׳`
                : `₪${Number(base).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
              const total = sal?.is_paid
                ? (sal.total || 0)
                : calcTotal(base, hours, e.salary_type, sal?.additions || [], sal?.deductions || [])
              const isPaid = sal?.is_paid || false

              return (
                <tr key={e.id} style={{ background: isPaid ? '#f0fdf4' : undefined }}>
                  <td style={tdSt}>
                    <strong>{e.full_name}</strong>
                    {e.role && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.role}</div>}
                    {sal?.notes && <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: 2 }}>📝 {sal.notes}</div>}
                  </td>

                  <td style={tdSt}>{displayBase}</td>

                  {/* Hours */}
                  <td style={tdSt}>
                    {e.salary_type === 'hourly' && salaryEditMode && !isPaid ? (
                      <input
                        type="number" min="0" step="0.5"
                        value={hoursMap[e.id] ?? (sal?.hours || '')}
                        onChange={ev => setHoursMap(prev => ({ ...prev, [e.id]: ev.target.value }))}
                        onBlur={() => saveHours(e)}
                        style={{ ...inp, width: '70px' }}
                      />
                    ) : e.salary_type === 'hourly' ? (
                      <span>{sal?.hours || 0} שע׳</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  {/* Additions */}
                  <td style={tdSt}>
                    {salaryEditMode && !isPaid ? (
                      <button onClick={() => openAdj(e)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: adds > 0 ? 'var(--primary)' : 'var(--text-muted)', fontSize: '13px', padding: 0,
                      }}>
                        {adds > 0 ? `+${fmt(adds)}` : '—'} ✏️
                      </button>
                    ) : (
                      <span style={{ color: adds > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {adds > 0 ? `+${fmt(adds)}` : '—'}
                      </span>
                    )}
                  </td>

                  {/* Deductions */}
                  <td style={tdSt}>
                    {salaryEditMode && !isPaid ? (
                      <button onClick={() => openAdj(e)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: deds > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '13px', padding: 0,
                      }}>
                        {deds > 0 ? `−${fmt(deds)}` : '—'} ✏️
                      </button>
                    ) : (
                      <span style={{ color: deds > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {deds > 0 ? `−${fmt(deds)}` : '—'}
                      </span>
                    )}
                  </td>

                  <td style={tdSt}><strong>{fmt(total)}</strong></td>

                  {/* Status */}
                  <td style={tdSt}>
                    {isPaid ? (
                      <div>
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                          ✅ שולם
                        </span>
                        {sal?.payment_method && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {sal.payment_method}{sal.payment_ref ? ` · ${sal.payment_ref}` : ''}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ background: '#fff7ed', color: 'var(--warning)', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                        ⏳ ממתין
                      </span>
                    )}
                  </td>

                  {/* Pay button – always visible */}
                  <td style={tdSt}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!isPaid && <Button size="sm" onClick={() => openPay(e.id)}>✅ שלם</Button>}
                      <Button size="sm" variant="ghost" onClick={() => openHistory(e)} title="היסטוריה">📋</Button>
                    </div>
                  </td>

                  {/* Edit-mode actions */}
                  {salaryEditMode && (
                    <td style={tdSt}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!isPaid && (
                          <Button size="sm" variant="secondary" onClick={() => openAdj(e)} title="תוספות וניכויים">✏️</Button>
                        )}
                        {isPaid && (
                          <Button size="sm" variant="secondary" onClick={() => { if (sal) unpay(sal) }} title="בטל תשלום">↩️ בטל</Button>
                        )}
                      </div>
                    </td>
                  )}
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

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'עובדים פעילים', value: activeEmps.length, color: '' },
          { label: 'שכר חודש נוכחי', value: fmt(totalPayroll), color: 'orange' },
          { label: 'ממתינים לתשלום', value: unpaidCount, color: unpaidCount > 0 ? 'red' : '' },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 160px', background: '#fff', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', padding: '16px 20px',
            borderTop: `3px solid ${s.color === 'orange' ? 'var(--warning)' : s.color === 'red' ? 'var(--danger)' : 'var(--primary)'}`,
          }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'inline-flex', background: '#e8f5ee', borderRadius: '14px', padding: '4px', gap: '2px', marginBottom: '24px' }}>
        {(['employees', 'salaries'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '14px', fontWeight: 700,
            background: tab === t ? 'var(--primary)' : 'transparent',
            color: tab === t ? '#fff' : 'var(--primary)',
            opacity: tab === t ? 1 : 0.65,
          }}>
            {t === 'employees' ? '👷 עובדים' : '💰 משכורות'}
          </button>
        ))}
      </div>

      {/* Employees tab */}
      {tab === 'employees' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <Button onClick={openAdd}>+ הוסף עובד</Button>
          </div>
          {renderEmpCards()}
        </div>
      )}

      {/* Salaries tab */}
      {tab === 'salaries' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontWeight: 700, fontSize: '14px' }}>תקופה:</label>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                style={{ ...inp, width: 'auto' }}
              >
                {buildPeriodList().map(p => (
                  <option key={p} value={p}>{periodLabel(p)}</option>
                ))}
              </select>
            </div>
            {renderSalarySummary()}
            <button
              onClick={initPeriodRecords}
              disabled={initingPeriod}
              title="צור רשומות שכר לכל העובדים הפעילים לחודש זה"
              style={{
                padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #bbf7d0',
                cursor: initingPeriod ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600,
                fontFamily: 'inherit', background: '#f0fdf4', color: '#16a34a',
                opacity: initingPeriod ? 0.6 : 1,
              }}
            >
              {initingPeriod ? '⏳ יוצר...' : '🔄 אתחל חודש'}
            </button>
            <button
              onClick={() => setSalaryEditMode(m => !m)}
              style={{
                marginRight: 'auto',
                padding: '7px 16px', borderRadius: '8px', border: '1.5px solid',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                borderColor: salaryEditMode ? 'var(--warning)' : 'var(--border)',
                background: salaryEditMode ? '#fffbeb' : '#fff',
                color: salaryEditMode ? 'var(--warning)' : 'var(--text-muted)',
              }}
            >
              {salaryEditMode ? '🔒 נעל עריכה' : '✏️ עריכה'}
            </button>
          </div>
          {renderSalaryTable()}
        </div>
      )}

      {/* ── Employee Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={empModal}
        onClose={() => setEmpModal(false)}
        title={editEmp ? 'עריכת עובד' : 'עובד חדש'}
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEmpModal(false)}>ביטול</Button>
            <Button onClick={saveEmp}>💾 שמור</Button>
          </>
        }
      >
        {/* Pay type */}
        <div style={{ display: 'flex', gap: 0, border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
          {(['monthly', 'hourly'] as const).map(t => (
            <button key={t} onClick={() => setForm(f => ({ ...f, salary_type: t }))} style={{
              flex: 1, padding: '9px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
              background: form.salary_type === t ? 'var(--primary)' : '#fff',
              color: form.salary_type === t ? '#fff' : 'var(--text-muted)',
            }}>
              {t === 'monthly' ? 'שכר חודשי קבוע' : 'שכר שעתי'}
            </button>
          ))}
        </div>

        {/* Basic fields */}
        <div style={grid2}>
          <div style={field}>
            <label style={lbl}>שם מלא *</label>
            <input style={inp} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="ישראל ישראלי" />
          </div>
          <div style={field}>
            <label style={lbl}>תפקיד</label>
            <input style={inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="מכונאי, מוכר..." />
          </div>
          <div style={field}>
            <label style={lbl}>מייל *</label>
            <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
          </div>
          <div style={field}>
            <label style={lbl}>טלפון</label>
            <input style={inp} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="050-0000000" />
          </div>
          {form.salary_type === 'monthly' ? (
            <div style={field}>
              <label style={lbl}>שכר בסיס (₪/חודש)</label>
              <input style={inp} type="number" min="0" step="1" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} placeholder="7000" />
            </div>
          ) : (
            <div style={field}>
              <label style={lbl}>תעריף שעתי (₪/שעה)</label>
              <input style={inp} type="number" min="0" step="0.5" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} placeholder="45" />
            </div>
          )}
          <div style={field}>
            <label style={lbl}>יום תשלום בחודש</label>
            <input
              style={inp} type="number" min="1" max="31" placeholder="למשל 10"
              value={form.payment_day}
              onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))}
            />
          </div>
          <div style={field}>
            <label style={lbl}>תאריך תחילת עבודה</label>
            <input style={inp} type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div style={field}>
            <label style={lbl}>תאריך סיום עבודה <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(ריק = פעיל)</span></label>
            <input style={inp} type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <div style={{ ...field, justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: '16px', height: '16px' }} />
              עובד פעיל (גישה למערכת)
            </label>
          </div>
          <div style={{ ...field, gridColumn: '1/-1' }}>
            <label style={lbl}>הערות</label>
            <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        {/* Bank details */}
        <details style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '10px 14px', fontWeight: 700, fontSize: '13px', background: '#f8fafc', userSelect: 'none' }}>
            💳 פרטי חשבון בנק
          </summary>
          <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* שם בנק – custom dropdown + badge מס' בנק */}
            <div style={field}>
              <label style={lbl}>שם בנק</label>
              <div ref={bankDropRef} style={{ position: 'relative' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    style={inp}
                    value={form.bank_name}
                    placeholder="התחל להקליד..."
                    onFocus={() => setShowBankDrop(true)}
                    onChange={e => { setForm(f => ({ ...f, bank_name: e.target.value })); setShowBankDrop(true) }}
                  />
                  {/* Arrow button – always opens the list */}
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
                  {/* Bank code badge */}
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
                {/* Dropdown list */}
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
                            background: form.bank_name === b.name ? '#f0fdf4' : undefined,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = form.bank_name === b.name ? '#f0fdf4' : '')}
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
              <label style={lbl}>מספר סניף</label>
              <input style={inp} value={form.bank_branch} placeholder="123" onChange={e => setForm(f => ({ ...f, bank_branch: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={lbl}>מספר חשבון</label>
              <input style={inp} value={form.bank_account} placeholder="12345678" onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} />
            </div>
            <div style={field}>
              <label style={lbl}>שם בעל החשבון</label>
              <input style={inp} value={form.bank_holder} placeholder="אם שונה מהעובד" onChange={e => setForm(f => ({ ...f, bank_holder: e.target.value }))} />
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
              <label style={lbl}>מספר ת.ז.</label>
              <input style={inp} value={form.id_number} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} placeholder="000000000" />
            </div>
            <div style={field}>
              <label style={lbl}>תאריך לידה</label>
              <input style={inp} type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
            </div>
            <div style={{ ...field, gridColumn: '1/-1' }}>
              <label style={lbl}>כתובת מגורים</label>
              <input style={inp} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="רחוב, מספר, עיר" />
            </div>
            <div style={field}>
              <label style={lbl}>מידת חולצה</label>
              <select style={inp} value={form.shirt_size} onChange={e => setForm(f => ({ ...f, shirt_size: e.target.value }))}>
                <option value="">—</option>
                {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={field}>
              <label style={lbl}>מידת מכנסיים</label>
              <input style={inp} value={form.pants_size} onChange={e => setForm(f => ({ ...f, pants_size: e.target.value }))} placeholder="32, 34, L..." />
            </div>
            <div style={field}>
              <label style={lbl}>מידת נעליים</label>
              <input style={inp} value={form.shoe_size} onChange={e => setForm(f => ({ ...f, shoe_size: e.target.value }))} placeholder="42" />
            </div>
          </div>
        </details>
      </Modal>

      {/* ── Adjustments Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={adjModal}
        onClose={() => setAdjModal(false)}
        title={`תוספות וניכויים – ${employees.find(e => e.id === adjEmpId)?.full_name || ''} – ${periodLabel(period)}`}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjModal(false)}>ביטול</Button>
            <Button onClick={saveAdj}>💾 שמור</Button>
          </>
        }
      >
        <p style={sectionTitle}>➕ תוספות</p>
        {adjAdditions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
            <input style={{ ...inp, flex: 1 }} placeholder="בונוס, נסיעות..." value={a.label}
              onChange={e => adjItem(adjAdditions, setAdjAdditions, i, 'label', e.target.value)} />
            <input style={{ ...inp, width: '90px' }} type="number" min="0" step="1" placeholder="₪" value={a.amount || ''}
              onChange={e => adjItem(adjAdditions, setAdjAdditions, i, 'amount', e.target.value)} />
            <button onClick={() => setAdjAdditions(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setAdjAdditions(prev => [...prev, { label: '', amount: 0 }])}>+ הוסף תוספת</Button>

        <p style={{ ...sectionTitle, marginTop: '20px' }}>➖ ניכויים</p>
        {adjDeductions.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
            <input style={{ ...inp, flex: 1 }} placeholder="ניכוי, מחלה..." value={d.label}
              onChange={e => adjItem(adjDeductions, setAdjDeductions, i, 'label', e.target.value)} />
            <input style={{ ...inp, width: '90px' }} type="number" min="0" step="1" placeholder="₪" value={d.amount || ''}
              onChange={e => adjItem(adjDeductions, setAdjDeductions, i, 'amount', e.target.value)} />
            <button onClick={() => setAdjDeductions(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setAdjDeductions(prev => [...prev, { label: '', amount: 0 }])}>+ הוסף ניכוי</Button>

        <div style={{ marginTop: '16px' }}>
          <label style={lbl}>הערות</label>
          <input style={inp} value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="הערה..." />
        </div>
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
            <Button onClick={confirmPay} loading={paying}>✅ אישור תשלום</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={field}>
            <label style={lbl}>אמצעי תשלום</label>
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
            <label style={lbl}>אסמכתא (אופציונלי)</label>
            <input style={inp} value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="מספר צ'ק / אסמכתא העברה..." />
          </div>
          <div style={field}>
            <label style={lbl}>תאריך תשלום (יירשם כהוצאה)</label>
            <input style={inp} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
          <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
            סה״כ לתשלום: {fmt(salaryFor(payEmpId)?.total ?? employees.find(e => e.id === payEmpId)?.base_salary ?? 0)}
          </div>
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
                  <th style={thSt}>סה״כ</th>
                  <th style={thSt}>אמצעי תשלום</th>
                  <th style={thSt}>אסמכתא</th>
                  <th style={thSt}>תאריך תשלום</th>
                  <th style={thSt}>סטטוס</th>
                  <th style={thSt}></th>
                </tr>
              </thead>
              <tbody>
                {histRows.filter(s => (s.total || 0) > 0 || s.is_paid).map(s => (
                  <tr key={s.id} style={{ background: s.is_paid ? '#f0fdf4' : undefined }}>
                    <td style={tdSt}><strong>{periodLabel(s.month)}</strong></td>
                    <td style={tdSt}>{fmt(s.total || 0)}</td>
                    <td style={tdSt}>{s.payment_method || '—'}</td>
                    <td style={tdSt}>{s.payment_ref || '—'}</td>
                    <td style={tdSt}>{s.paid_date ? new Date(s.paid_date).toLocaleDateString('he-IL') : '—'}</td>
                    <td style={tdSt}>
                      {s.is_paid ? (
                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>✅ שולם</span>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
