import { SupabaseClient } from '@supabase/supabase-js'
import { quickCreateExpense, quickCreateIncome } from '@/lib/expenses/quickCreateExpense'

// Confirms a user-picked (never auto-picked) match between a statement line
// and an existing expense/income row. One plain .update() call, matching the
// no-RPCs convention already used everywhere else in this app
// (e.g. lib/debts/reconcileSupplierPayment.ts).
export async function confirmMatch(
  supabase: SupabaseClient,
  lineId: string,
  matchedId: string,
  direction: 'debit' | 'credit',
  reconciledBy: string | null,
  confidence: 'exact' | 'approx',
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bank_statement_lines').update({
    status: 'matched',
    matched_expense_id: direction === 'debit' ? matchedId : null,
    matched_income_id: direction === 'credit' ? matchedId : null,
    match_confidence: confidence,
    reconciled_by: reconciledBy,
    reconciled_at: new Date().toISOString(),
  }).eq('id', lineId)
  return { error: error?.message ?? null }
}

export async function ignoreLine(
  supabase: SupabaseClient,
  lineId: string,
  reason: string,
  reconciledBy: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bank_statement_lines').update({
    status: 'ignored',
    ignored_reason: reason,
    reconciled_by: reconciledBy,
    reconciled_at: new Date().toISOString(),
  }).eq('id', lineId)
  return { error: error?.message ?? null }
}

// Creates a new expense/income row directly from a statement line that had
// no candidate match, prefilled from the line itself (date + amount fixed,
// category/description editable) -- the same write path (quickCreateExpense/
// quickCreateIncome) used by QuickExpenseModal, so the created row is an
// ordinary expense/income row with nothing bank-sync-specific about it.
export async function createFromLine(
  supabase: SupabaseClient,
  tenantId: string,
  lineId: string,
  direction: 'debit' | 'credit',
  date: string,
  amount: number,
  category: string,
  description: string,
  defaultPaymentMethod: string | null,
  reconciledBy: string | null,
): Promise<{ error: string | null }> {
  const create = direction === 'debit' ? quickCreateExpense : quickCreateIncome
  const { data, error } = await create(supabase, {
    tenantId, date, category, description, amount, paymentMethod: defaultPaymentMethod,
  })
  if (error || !data) return { error: error ?? 'שגיאה ביצירת הרשומה' }

  const { error: updErr } = await supabase.from('bank_statement_lines').update({
    status: 'created',
    matched_expense_id: direction === 'debit' ? data.id : null,
    matched_income_id: direction === 'credit' ? data.id : null,
    reconciled_by: reconciledBy,
    reconciled_at: new Date().toISOString(),
  }).eq('id', lineId)
  return { error: updErr?.message ?? null }
}

// Reverts a matched/created line back to unmatched. Never deletes the
// expense/income row it had pointed to -- only clears the reconciliation link.
export async function undoLine(
  supabase: SupabaseClient,
  lineId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bank_statement_lines').update({
    status: 'unmatched',
    matched_expense_id: null,
    matched_income_id: null,
    match_confidence: null,
    ignored_reason: null,
    reconciled_by: null,
    reconciled_at: null,
  }).eq('id', lineId)
  return { error: error?.message ?? null }
}
