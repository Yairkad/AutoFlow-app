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

/** A scanned invoice/receipt in Drive (supplier_debts.drive_file_* → expenses.receipt_*). */
export type ScanLink = { id: string; name: string | null; url: string | null }

/** The scan attached to an invoice: its own file, else the first line (multi-invoice entry) that has one. */
export function debtScan(d: {
  drive_file_id: string | null; drive_file_name: string | null; drive_file_url: string | null
  invoices?: { drive_file_id?: string; drive_file_name?: string; drive_file_url?: string }[] | null
}): ScanLink | null {
  if (d.drive_file_id) return { id: d.drive_file_id, name: d.drive_file_name, url: d.drive_file_url }
  const i = d.invoices?.find(x => x.drive_file_id)
  return i?.drive_file_id ? { id: i.drive_file_id, name: i.drive_file_name ?? null, url: i.drive_file_url ?? null } : null
}

/** Show the invoice scan on the payment's expense. A separate update (best effort) so a missing
 *  migration 117 never fails the payment itself. */
async function linkScanToExpense(supabase: SupabaseClient, expenseId: string, scan: ScanLink | null | undefined) {
  if (!scan) return
  await supabase.from('expenses')
    .update({ receipt_file_id: scan.id, receipt_name: scan.name ?? 'חשבונית', receipt_url: scan.url }).eq('id', expenseId)
}

export async function recordSupplierPayment(
  supabase: SupabaseClient,
  p: { tenantId: string; supplierId: string; supplierName: string; amount: number; date: string; method: DirectMethodHe; ref?: string | null; scan?: ScanLink | null },
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
  await linkScanToExpense(supabase, exp.data.id, p.scan)
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

/**
 * One-off purchase (an invoice with NO supplier): the payment is tied to that invoice itself,
 * since there's no supplier balance to lower. Cash / card / transfer → an expense + a paid
 * scheduled_payments row; a check → an open check row (checks journal) for its due date.
 * Either way a supplier_debt_payments allocation dated on the payment links it to the invoice
 * (the "ללא ספק" ledger counts allocations) and the invoice's `paid` / is_closed are updated.
 */
export async function payOneOffInvoice(
  supabase: SupabaseClient,
  p: {
    tenantId: string; debt: { id: string; amount: number; paid: number; doc_number: string | null; description: string | null } & Parameters<typeof debtScan>[0]
    amount: number; date: string; method: DirectMethodHe | "צ'ק"; ref?: string | null
  },
): Promise<{ error: string | null }> {
  const description = ['תשלום חשבונית', p.debt.doc_number, p.debt.description].filter(Boolean).join(' ')
  let expenseId: string | null = null
  if (p.method !== "צ'ק") {
    const exp = await supabase.from('expenses').insert({
      tenant_id: p.tenantId, date: p.date, category: 'ספקים', description, amount: p.amount,
      supplier_id: null, payment_method: p.method, payment_ref: p.method === 'העברה' ? (p.ref || null) : null,
    }).select('id').single()
    if (exp.error) return { error: exp.error.message }
    expenseId = exp.data.id
  }
  const isCheck = p.method === "צ'ק"
  const sp = await supabase.from('scheduled_payments').insert({
    tenant_id: p.tenantId, supplier_id: null, description, amount: p.amount, due_date: p.date,
    paid_date: isCheck ? null : p.date, is_paid: !isCheck, expense_id: expenseId,
    payment_method: isCheck ? 'check' : DIRECT_METHODS[p.method as DirectMethodHe], category: 'ספקים',
    ...(isCheck ? { check_number: p.ref || null } : { notes: p.ref || null }),
  }).select('id').single()
  const undoExpense = async () => { if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId) }
  if (sp.error) { await undoExpense(); return { error: sp.error.message } }
  const al = await supabase.from('supplier_debt_payments').insert({
    tenant_id: p.tenantId, supplier_debt_id: p.debt.id, scheduled_payment_id: sp.data.id, amount: p.amount,
    created_at: `${p.date}T12:00:00Z`,
  })
  if (al.error) { await supabase.from('scheduled_payments').delete().eq('id', sp.data.id); await undoExpense(); return { error: al.error.message } }
  const paid = Number(p.debt.paid) + p.amount
  const { error } = await supabase.from('supplier_debts')
    .update({ paid, is_closed: paid >= Number(p.debt.amount) - 0.005 }).eq('id', p.debt.id)
  if (!error && expenseId) await linkScanToExpense(supabase, expenseId, debtScan(p.debt))
  return { error: error?.message ?? null }
}

/** Undo a one-off invoice payment: the allocation, its payment row and expense, and the invoice's paid. */
export async function undoOneOffPayment(supabase: SupabaseClient, allocId: string): Promise<{ error: string | null }> {
  const { data: a, error } = await supabase.from('supplier_debt_payments').select('id, supplier_debt_id, scheduled_payment_id, amount').eq('id', allocId).maybeSingle()
  if (error || !a) return { error: error?.message ?? 'התשלום לא נמצא' }
  const { data: debt } = await supabase.from('supplier_debts').select('id, amount, paid').eq('id', a.supplier_debt_id).maybeSingle()
  if (debt) {
    const paid = Math.max(0, Number(debt.paid) - Number(a.amount))
    const { error: e } = await supabase.from('supplier_debts').update({ paid, is_closed: paid >= Number(debt.amount) - 0.005 && paid > 0 }).eq('id', debt.id)
    if (e) return { error: e.message }
  }
  const { error: e2 } = await supabase.from('supplier_debt_payments').delete().eq('id', a.id)
  if (e2) return { error: e2.message }
  if (a.scheduled_payment_id) {
    const { data: sp } = await supabase.from('scheduled_payments').select('id, expense_id').eq('id', a.scheduled_payment_id).maybeSingle()
    if (sp) {
      await supabase.from('scheduled_payments').delete().eq('id', sp.id)
      if (sp.expense_id) await supabase.from('expenses').delete().eq('id', sp.expense_id)
    }
  }
  return { error: null }
}
