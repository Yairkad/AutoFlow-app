import { SupabaseClient } from '@supabase/supabase-js'
import { reverseSupplierPayment } from './reverseSupplierPayment'
import { supplierEvents, balanceAfter } from './supplierLedger'

// Supplier payments are no longer tied to invoices/months: a payment just lowers the
// supplier's running balance (lib/debts/supplierLedger.ts). A cash / card / bank-transfer
// payment made from the "💰 תשלום" window is stored as an already-paid scheduled_payments row
// (so the ledger counts it on its date) linked to the expense row that records it.

/** scheduled_payments.payment_method values of direct (non-check) payments. They are kept
 *  apart from 'check' / 'transfer' so the checks journal and the scheduled-payments list
 *  don't show them. */
export const DIRECT_METHODS = { 'מזומן': 'cash', 'אשראי': 'card', 'העברה': 'bank_transfer' } as const
export type DirectMethodHe = keyof typeof DIRECT_METHODS

export const paymentMethodLabel = (m: string | null | undefined) =>
  m === 'check' ? "צ'ק" : m === 'cash' ? 'מזומן' : m === 'card' ? 'אשראי' : 'העברה'

export async function recordSupplierPayment(
  supabase: SupabaseClient,
  p: { tenantId: string; supplierId: string; supplierName: string; amount: number; date: string; method: DirectMethodHe; ref?: string | null },
): Promise<{ error: string | null }> {
  const description = `תשלום לספק ${p.supplierName}`
  const exp = await supabase.from('expenses').insert({
    tenant_id: p.tenantId, date: p.date, category: 'ספקים', description, amount: p.amount,
    supplier_id: p.supplierId, payment_method: p.method,
    payment_ref: p.method === 'העברה' ? (p.ref || null) : null,
  }).select('id').single()
  if (exp.error) return { error: exp.error.message }
  const sp = await supabase.from('scheduled_payments').insert({
    tenant_id: p.tenantId, supplier_id: p.supplierId, description, amount: p.amount,
    due_date: p.date, paid_date: p.date, is_paid: true, expense_id: exp.data.id,
    payment_method: DIRECT_METHODS[p.method], category: 'ספקים', notes: p.ref || null,
  })
  if (sp.error) {
    await supabase.from('expenses').delete().eq('id', exp.data.id)
    return { error: sp.error.message }
  }
  return { error: null }
}

/** Undo old-style direct allocations (supplier_debt_payments rows with no payment row behind
 *  them): take the amount back off each invoice's `paid` and delete the rows. */
export async function deleteDirectAllocations(supabase: SupabaseClient, allocIds: string[]): Promise<{ error: string | null }> {
  if (!allocIds.length) return { error: null }
  const { data: links, error } = await supabase.from('supplier_debt_payments')
    .select('id, supplier_debt_id, amount').in('id', allocIds).is('scheduled_payment_id', null)
  if (error) return { error: error.message }
  for (const l of links ?? []) {
    const { data: debt } = await supabase.from('supplier_debts').select('id, amount, paid').eq('id', l.supplier_debt_id).maybeSingle()
    if (debt) {
      const paid = Math.max(0, Number(debt.paid) - Number(l.amount))
      const { error: e } = await supabase.from('supplier_debts')
        .update({ paid, is_closed: paid >= Number(debt.amount) && Number(debt.amount) > 0 }).eq('id', debt.id)
      if (e) return { error: e.message }
    }
    const { error: e } = await supabase.from('supplier_debt_payments').delete().eq('id', l.id)
    if (e) return { error: e.message }
  }
  return { error: null }
}

/**
 * Called when an expense is deleted (/expenses): if it recorded a supplier payment, remove that
 * payment from the supplier's account too — otherwise the balance keeps counting money that was
 * never paid (bug-095). New payments are found by expense_id; old ones (allocated straight to
 * invoices) by supplier + amount + the minute they were saved.
 */
export async function removeSupplierPaymentOfExpense(
  supabase: SupabaseClient,
  expense: { id: string; supplier_id: string | null; amount: number; created_at?: string | null },
): Promise<{ removed: boolean; error: string | null }> {
  const { data: sps } = await supabase.from('scheduled_payments')
    .select('id, payment_method').eq('expense_id', expense.id)
  const direct = (sps ?? []).filter(s => s.payment_method !== 'check' && s.payment_method !== 'transfer')
  if (direct.length) {
    for (const s of direct) {
      const { error } = await reverseSupplierPayment(supabase, s.id)
      if (error) return { removed: false, error }
      const { error: e } = await supabase.from('scheduled_payments').delete().eq('id', s.id)
      if (e) return { removed: false, error: e.message }
    }
    return { removed: true, error: null }
  }
  if (!expense.supplier_id || !expense.created_at) return { removed: false, error: null }
  const t = new Date(expense.created_at).getTime()
  const from = new Date(t - 3 * 60_000).toISOString(), to = new Date(t + 3 * 60_000).toISOString()
  const { data: debts } = await supabase.from('supplier_debts').select('id').eq('supplier_id', expense.supplier_id)
  const ids = (debts ?? []).map(d => d.id)
  if (!ids.length) return { removed: false, error: null }
  const { data: links } = await supabase.from('supplier_debt_payments')
    .select('id, amount').is('scheduled_payment_id', null).in('supplier_debt_id', ids)
    .gte('created_at', from).lte('created_at', to)
  const sum = (links ?? []).reduce((s, l) => s + Number(l.amount), 0)
  if (!links?.length || Math.abs(sum - Number(expense.amount)) > 0.01) return { removed: false, error: null }
  const { error } = await deleteDirectAllocations(supabase, links.map(l => l.id))
  return { removed: !error, error }
}

/** Σ of every supplier's running balance that is still owed (> 0), and how many suppliers owe —
 *  for dashboard cards. Invoice `paid` / `is_closed` no longer track payments, so they can't be
 *  summed directly. */
export async function fetchSupplierOpenTotals(supabase: SupabaseClient): Promise<{ total: number; count: number }> {
  const [debts, allocs, pays] = await Promise.all([
    supabase.from('supplier_debts').select('id, supplier_id, date, amount, paid, direction, is_closed'),
    supabase.from('supplier_debt_payments').select('supplier_debt_id, scheduled_payment_id, amount, created_at'),
    supabase.from('scheduled_payments').select('id, supplier_id, amount, due_date, is_paid, allocation_ignored, payment_method, handed_date').not('supplier_id', 'is', null),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const all = debts.data ?? []
  let total = 0, count = 0
  for (const sid of new Set(all.map(d => d.supplier_id))) {
    const b = balanceAfter(supplierEvents(all.filter(d => d.supplier_id === sid), allocs.data ?? [],
      sid ? (pays.data ?? []).filter(p => p.supplier_id === sid) : [], today))
    if (b > 0.005) { total += b; count++ }
  }
  return { total, count }
}
