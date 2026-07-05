import { SupabaseClient } from '@supabase/supabase-js'

export interface DebtAllocation {
  supplier_debt_id: string
  amount: number
}

// Applies a user-chosen allocation of a payment (check or direct payment) against
// specific supplier_debts rows. Unlike FIFO, this never touches a debt the caller
// didn't explicitly include — the caller decides which months to close.
export async function reconcileSupplierPayment(
  supabase: SupabaseClient,
  tenantId: string,
  allocations: DebtAllocation[],
  scheduledPaymentId: string | null,
): Promise<{ error: string | null }> {
  for (const alloc of allocations) {
    if (alloc.amount <= 0) continue

    const { data: debt, error: fetchErr } = await supabase
      .from('supplier_debts')
      .select('id, amount, paid')
      .eq('id', alloc.supplier_debt_id)
      .single()
    if (fetchErr || !debt) return { error: fetchErr?.message ?? 'חוב לא נמצא' }

    const newPaid  = Number(debt.paid) + alloc.amount
    const isClosed = newPaid >= Number(debt.amount)

    const { error: updErr } = await supabase
      .from('supplier_debts')
      .update({ paid: newPaid, is_closed: isClosed })
      .eq('id', debt.id)
    if (updErr) return { error: updErr.message }

    const { error: insErr } = await supabase.from('supplier_debt_payments').insert({
      tenant_id: tenantId,
      supplier_debt_id: debt.id,
      scheduled_payment_id: scheduledPaymentId,
      amount: alloc.amount,
    })
    if (insErr) return { error: insErr.message }
  }
  return { error: null }
}
