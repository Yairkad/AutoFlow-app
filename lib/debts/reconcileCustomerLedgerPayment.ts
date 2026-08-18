import { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerPaymentMeta {
  payment_method: string
  check_number?: string | null
  check_date?: string | null
  notes?: string | null
  payment_date: string
  receipt_issued: boolean
  receipt_number?: string | null
}

// Records a customer payment as one flat amount against the customer — not allocated to any
// specific customer_ledger_debt row. The balance is Σcharges − Σcredits − Σpayments
// (lib/debts/ledger.ts), so no per-debt paid/is_closed bookkeeping happens here at all.
export async function recordCustomerPayment(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
  amount: number,
  paymentMeta: CustomerPaymentMeta,
): Promise<{ error: string | null }> {
  if (amount <= 0) return { error: 'סכום לא תקין' }

  const { error } = await supabase.from('customer_ledger_payments').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    customer_ledger_debt_id: null,
    amount,
    payment_method: paymentMeta.payment_method,
    check_number: paymentMeta.check_number ?? null,
    check_date: paymentMeta.check_date ?? null,
    notes: paymentMeta.notes ?? null,
    payment_date: paymentMeta.payment_date,
    receipt_issued: paymentMeta.receipt_issued,
    receipt_number: paymentMeta.receipt_issued ? (paymentMeta.receipt_number ?? null) : null,
  })
  return { error: error?.message ?? null }
}
