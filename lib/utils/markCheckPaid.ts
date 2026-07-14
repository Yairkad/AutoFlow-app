import { SupabaseClient } from '@supabase/supabase-js'

export interface MarkPaidPayment {
  id: string
  amount: number
  supplier_id: string | null
  payment_method: 'check' | 'transfer'
  notes: string | null
}

export interface MarkPaidOptions {
  paidDate: string
  category: string
  description: string
}

// Shared by ScheduledPaymentsModal's manual "✓ שולם" flow and the checks
// journal page — creates the matching expense row, then flips is_paid/paid_date/expense_id.
export async function markScheduledPaymentPaid(
  supabase: SupabaseClient,
  tenantId: string,
  payment: MarkPaidPayment,
  opts: MarkPaidOptions,
): Promise<{ error: string | null; expenseId?: string }> {
  const expRes = await supabase.from('expenses').insert({
    tenant_id:      tenantId,
    date:           opts.paidDate,
    category:       opts.category,
    description:    opts.description,
    amount:         payment.amount,
    supplier_id:    payment.supplier_id,
    payment_method: payment.payment_method === 'check' ? "צ'ק" : 'העברה',
    payment_ref:    payment.notes || null,
  }).select('id').single()

  if (expRes.error) return { error: expRes.error.message }

  const updRes = await supabase.from('scheduled_payments').update({
    is_paid: true, paid_date: opts.paidDate, expense_id: expRes.data.id,
  }).eq('id', payment.id)

  if (updRes.error) return { error: updRes.error.message }

  return { error: null, expenseId: expRes.data.id }
}
