import type { SupabaseClient } from '@supabase/supabase-js'
import { supplierEvents, balanceAfter } from './supplierLedger'

// Open balance per supplier on the running-account model (charges − credits − payments),
// for KPI widgets that don't load the supplier screen's data.
export async function fetchSupplierBalances(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [debtsRes, paysRes] = await Promise.all([
    supabase.from('supplier_debts').select('id, supplier_id, date, amount, paid, direction, is_closed'),
    supabase.from('scheduled_payments').select('*').not('supplier_id', 'is', null),
  ])
  type D = { id: string; supplier_id: string | null; date: string; amount: number; paid: number; direction: string | null; is_closed: boolean }
  type P = { id: string; supplier_id: string; amount: number; due_date: string; is_paid: boolean; payment_method: string | null; handed_date?: string | null }
  const debts = (debtsRes.data ?? []) as D[]
  const pays = (paysRes.data ?? []) as P[]
  const today = new Date().toLocaleDateString('sv-SE')
  const out = new Map<string, number>()
  for (const sid of new Set(debts.map(d => d.supplier_id).filter(Boolean) as string[])) {
    const b = balanceAfter(supplierEvents(debts.filter(d => d.supplier_id === sid), pays.filter(p => p.supplier_id === sid), today))
    out.set(sid, Math.round(b * 100) / 100)
  }
  return out
}
