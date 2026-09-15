import { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerDebtPaymentMeta {
  amount: number
  payment_date: string
  payment_method: string
  reference?: string | null
  receipt_issued: boolean
  receipt_number?: string | null
}

// customer_debts.paid is a denormalized cache — always recomputed from the real
// sum of customer_debt_payments rows so add/edit/delete can never leave it stale.
async function recomputePaid(supabase: SupabaseClient, customerDebtId: string): Promise<number> {
  const { data } = await supabase.from('customer_debt_payments').select('amount').eq('customer_debt_id', customerDebtId)
  return (data ?? []).reduce((sum, r) => sum + Number(r.amount), 0)
}

// is_closed is a manual, independent flag (the user may close a debt without full payment) —
// only a NEW payment that covers the full amount auto-closes it; edits/deletes never touch it.
export async function insertCustomerDebtPayment(
  supabase: SupabaseClient,
  tenantId: string,
  customerDebtId: string,
  debtAmount: number,
  meta: CustomerDebtPaymentMeta,
): Promise<{ error: string | null; isClosed: boolean }> {
  if (meta.amount <= 0) return { error: 'סכום לא תקין', isClosed: false }

  const { error: insErr } = await supabase.from('customer_debt_payments').insert({
    tenant_id: tenantId,
    customer_debt_id: customerDebtId,
    amount: meta.amount,
    payment_date: meta.payment_date,
    payment_method: meta.payment_method,
    reference: meta.reference?.trim() || null,
    transfer_verified: meta.payment_method === 'העברה' ? false : null,
    receipt_issued: meta.receipt_issued,
    receipt_number: meta.receipt_issued ? (meta.receipt_number?.trim() || null) : null,
  })
  if (insErr) return { error: insErr.message, isClosed: false }

  const paid = await recomputePaid(supabase, customerDebtId)
  const isClosed = paid >= debtAmount
  const { error: updErr } = await supabase.from('customer_debts').update({ paid, is_closed: isClosed }).eq('id', customerDebtId)
  return { error: updErr?.message ?? null, isClosed }
}

export async function updateCustomerDebtPayment(
  supabase: SupabaseClient,
  paymentId: string,
  customerDebtId: string,
  meta: CustomerDebtPaymentMeta,
): Promise<{ error: string | null }> {
  if (meta.amount <= 0) return { error: 'סכום לא תקין' }

  const { data: current } = await supabase
    .from('customer_debt_payments')
    .select('payment_method, transfer_verified')
    .eq('id', paymentId)
    .single()
  const transferVerified =
    meta.payment_method === 'העברה'
      ? (current?.payment_method === 'העברה' ? current.transfer_verified : false)
      : null

  const { error: updErr } = await supabase.from('customer_debt_payments').update({
    amount: meta.amount,
    payment_date: meta.payment_date,
    payment_method: meta.payment_method,
    reference: meta.reference?.trim() || null,
    transfer_verified: transferVerified,
    receipt_issued: meta.receipt_issued,
    receipt_number: meta.receipt_issued ? (meta.receipt_number?.trim() || null) : null,
  }).eq('id', paymentId)
  if (updErr) return { error: updErr.message }

  const paid = await recomputePaid(supabase, customerDebtId)
  const { error: debtErr } = await supabase.from('customer_debts').update({ paid }).eq('id', customerDebtId)
  return { error: debtErr?.message ?? null }
}

export async function deleteCustomerDebtPayment(
  supabase: SupabaseClient,
  paymentId: string,
  customerDebtId: string,
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase.from('customer_debt_payments').delete().eq('id', paymentId)
  if (delErr) return { error: delErr.message }

  const paid = await recomputePaid(supabase, customerDebtId)
  const { error: debtErr } = await supabase.from('customer_debts').update({ paid }).eq('id', customerDebtId)
  return { error: debtErr?.message ?? null }
}
