import { SupabaseClient } from '@supabase/supabase-js'

export interface QuickExpenseInput {
  tenantId: string
  date: string
  category: string
  description: string
  amount: number
  paymentMethod?: string | null
}

export interface QuickCreatedRow {
  id: string
  date: string
  category: string
  description: string
  amount: number
}

// Minimal-field expense insert -- the shared write path behind both the
// QuickExpenseModal ("⚡ הוספה מהירה" on /expenses) and the reconciliation
// review screen's inline "✓ צור הוצאה" action for an unmatched statement
// line. Everything not passed here (supplier_id, payment_ref,
// recurring_expense_id, amortize_months) is left null, same as a normal
// expense row -- there is nothing bank-sync-specific about the row itself.
export async function quickCreateExpense(
  supabase: SupabaseClient,
  input: QuickExpenseInput,
): Promise<{ data: QuickCreatedRow | null; error: string | null }> {
  const { data, error } = await supabase.from('expenses').insert({
    tenant_id: input.tenantId,
    date: input.date,
    category: input.category,
    description: input.description,
    amount: input.amount,
    payment_method: input.paymentMethod ?? 'אשראי',
  }).select('id, date, category, description, amount').single()

  return { data: data ?? null, error: error?.message ?? null }
}

// Same shape for income (credit-direction statement lines / income quick-add).
export async function quickCreateIncome(
  supabase: SupabaseClient,
  input: QuickExpenseInput,
): Promise<{ data: QuickCreatedRow | null; error: string | null }> {
  const { data, error } = await supabase.from('income').insert({
    tenant_id: input.tenantId,
    date: input.date,
    category: input.category,
    description: input.description,
    amount: input.amount,
    payment_method: input.paymentMethod ?? 'אשראי',
  }).select('id, date, category, description, amount').single()

  return { data: data ?? null, error: error?.message ?? null }
}
