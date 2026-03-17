'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AlertPayment {
  id: string
  description: string
  amount: number
  due_date: string
  payment_method: string
  supplier_id: string | null
}

interface UnpaidSalary {
  id: string
  employee_id: string
  month: string   // MM/YYYY
  total: number
}

interface Supplier  { id: string; name: string }
interface Employee  { id: string; full_name: string }

function fmt(n: number) {
  return '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })
}

function daysUntil(isoDate: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(isoDate + 'T00:00:00'); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function chipStyle(days: number): React.CSSProperties {
  if (days < 0)   return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
  if (days === 0) return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
  if (days <= 7)  return { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
  return            { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }
}

function dayLabel(days: number) {
  if (days < 0)   return `⚠️ ${Math.abs(days)}י' באיחור`
  if (days === 0) return '⚠️ היום'
  if (days === 1) return 'מחר'
  return `עוד ${days}י'`
}

function monthLabel(period: string) {
  const [mm, yyyy] = period.split('/')
  const names = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
  return (names[parseInt(mm)] || mm) + ' ' + yyyy
}

const SALARY_CHIP: React.CSSProperties = {
  background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
}

export default function AlertsPanel({ compact }: { compact?: boolean } = {}) {
  const [payments,  setPayments]  = useState<AlertPayment[]>([])
  const [salaries,  setSalaries]  = useState<UnpaidSalary[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const dismissed = new Set<string>()
  const [loading,   setLoading]   = useState(true)
  const supabase = useRef(createClient()).current

  const load = async () => {
    const ahead = new Date(); ahead.setDate(ahead.getDate() + 30)
    const aheadStr = ahead.toISOString().slice(0, 10)

    const [pmtRes, supRes, salRes, empRes] = await Promise.all([
      supabase
        .from('scheduled_payments')
        .select('id, description, amount, due_date, payment_method, supplier_id')
        .eq('is_paid', false)
        .lte('due_date', aheadStr)
        .order('due_date', { ascending: true }),
      supabase.from('suppliers').select('id, name'),
      supabase
        .from('salaries')
        .select('id, employee_id, month, total')
        .eq('is_paid', false)
        .order('month', { ascending: true }),
      supabase.from('employees').select('id, full_name').eq('is_active', true),
    ])

    setPayments(pmtRes.data ?? [])
    setSuppliers(supRes.data ?? [])
    setSalaries(salRes.data ?? [])
    setEmployees(empRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('alerts-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_payments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salaries' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visiblePayments = payments.filter(p => !dismissed.has(p.id))
  const visibleSalaries = salaries.filter(s => !dismissed.has(s.id) && (s.total || 0) > 0)
  const totalCount = visiblePayments.length + visibleSalaries.length

  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 14px', flex: 1,
        background: '#fff', borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)', borderTop: '3px solid var(--danger)',
        fontSize: '14px', fontWeight: 600, color: 'var(--text)',
      }}>
        <span>⚡</span>
        <span>התראות</span>
        {!loading && totalCount > 0 && (
          <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '999px', fontSize: '12px', fontWeight: 700, padding: '2px 9px', lineHeight: 1.4 }}>{totalCount}</span>
        )}
        {!loading && totalCount === 0 && (
          <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 400 }}>✓ הכל מטופל</span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      padding: '10px 16px',
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minHeight: '48px',
    }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{ fontSize: '16px' }}>⚡</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          התראות
        </span>
        {totalCount > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 700,
            background: 'var(--danger)', color: '#fff',
            borderRadius: '10px', padding: '1px 6px',
          }}>{totalCount}</span>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

      {/* Content */}
      {loading ? (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>טוען...</span>
      ) : totalCount === 0 ? (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          ✓ אין התראות פעילות
        </span>
      ) : (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>

          {/* Scheduled payments */}
          {visiblePayments.map(p => {
            const days = daysUntil(p.due_date)
            const cs   = chipStyle(days)
            const sup  = suppliers.find(s => s.id === p.supplier_id)?.name
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, ...cs }}>
                <span>{p.description}</span>
                {sup && <span style={{ opacity: 0.65, fontWeight: 400 }}>· {sup}</span>}
                <span style={{ fontWeight: 800 }}>{fmt(Number(p.amount))}</span>
                <span style={{ opacity: 0.75, fontWeight: 500 }}>{dayLabel(days)}</span>
                <span style={{ opacity: 0.55, fontSize: '11px', fontWeight: 400 }}>
                  {p.payment_method === 'check' ? "צ'ק" : 'העברה'}
                </span>
              </div>
            )
          })}

          {/* Unpaid salaries */}
          {visibleSalaries.map(s => {
            const emp = employees.find(e => e.id === s.employee_id)?.full_name ?? 'עובד'
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, ...SALARY_CHIP }}>
                <span>👷</span>
                <span>{emp}</span>
                <span style={{ opacity: 0.65, fontWeight: 400 }}>· {monthLabel(s.month)}</span>
                <span style={{ fontWeight: 800 }}>{fmt(Number(s.total))}</span>
                <span style={{ opacity: 0.7, fontSize: '11px' }}>לא שולם</span>
              </div>
            )
          })}

        </div>
      )}
    </div>
  )
}
