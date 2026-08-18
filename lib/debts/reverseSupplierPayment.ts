import { SupabaseClient } from '@supabase/supabase-js'

// Undoes everything reconcileSupplierPayment.ts did for a given scheduled_payment
// (check/transfer): for every supplier_debt_payments row it created, subtracts that
// amount back off the linked supplier_debts.paid (reopening it if needed), then
// deletes the junction row. Must run BEFORE the scheduled_payments row itself is
// deleted — supplier_debt_payments.scheduled_payment_id is ON DELETE SET NULL, so
// once the check is gone there's no way to find which debts it had funded.
export async function reverseSupplierPayment(
  supabase: SupabaseClient,
  scheduledPaymentId: string,
): Promise<{ error: string | null }> {
  const { data: links, error: fetchErr } = await supabase
    .from('supplier_debt_payments')
    .select('id, supplier_debt_id, amount')
    .eq('scheduled_payment_id', scheduledPaymentId)
  if (fetchErr) return { error: fetchErr.message }
  if (!links || links.length === 0) return { error: null }

  for (const link of links) {
    const { data: debt, error: debtErr } = await supabase
      .from('supplier_debts')
      .select('id, amount, paid')
      .eq('id', link.supplier_debt_id)
      .single()
    if (debtErr || !debt) continue // debt itself was deleted separately — nothing to reverse

    const newPaid = Math.max(0, Number(debt.paid) - Number(link.amount))
    const isClosed = newPaid >= Number(debt.amount) && Number(debt.amount) > 0

    const { error: updErr } = await supabase
      .from('supplier_debts')
      .update({ paid: newPaid, is_closed: isClosed })
      .eq('id', debt.id)
    if (updErr) return { error: updErr.message }

    const { error: delErr } = await supabase.from('supplier_debt_payments').delete().eq('id', link.id)
    if (delErr) return { error: delErr.message }
  }
  return { error: null }
}
