import { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerDebtAllocation {
  customer_ledger_debt_id: string
  amount: number
}

export interface CustomerPaymentMeta {
  payment_method: string
  check_number?: string | null
  check_date?: string | null
  notes?: string | null
  payment_date: string
  receipt_issued: boolean
  receipt_number?: string | null
}

// Applies a user-chosen allocation of a payment against specific
// customer_ledger_debts rows. Mirrors reconcileSupplierPayment.ts — no
// scheduled-payment concept here since customers have no check-series flow.
export async function reconcileCustomerLedgerPayment(
  supabase: SupabaseClient,
  tenantId: string,
  allocations: CustomerDebtAllocation[],
  paymentMeta: CustomerPaymentMeta,
): Promise<{ error: string | null }> {
  for (const alloc of allocations) {
    if (alloc.amount <= 0) continue

    const { data: debt, error: fetchErr } = await supabase
      .from('customer_ledger_debts')
      .select('id, amount, paid')
      .eq('id', alloc.customer_ledger_debt_id)
      .single()
    if (fetchErr || !debt) return { error: fetchErr?.message ?? 'חוב לא נמצא' }

    const newPaid  = Number(debt.paid) + alloc.amount
    const isClosed = newPaid >= Number(debt.amount)

    const { error: updErr } = await supabase
      .from('customer_ledger_debts')
      .update({ paid: newPaid, is_closed: isClosed })
      .eq('id', debt.id)
    if (updErr) return { error: updErr.message }

    const { error: insErr } = await supabase.from('customer_ledger_payments').insert({
      tenant_id: tenantId,
      customer_ledger_debt_id: debt.id,
      amount: alloc.amount,
      payment_method: paymentMeta.payment_method,
      check_number: paymentMeta.check_number ?? null,
      check_date: paymentMeta.check_date ?? null,
      notes: paymentMeta.notes ?? null,
      payment_date: paymentMeta.payment_date,
      receipt_issued: paymentMeta.receipt_issued,
      receipt_number: paymentMeta.receipt_issued ? (paymentMeta.receipt_number ?? null) : null,
    })
    if (insErr) return { error: insErr.message }
  }
  return { error: null }
}
