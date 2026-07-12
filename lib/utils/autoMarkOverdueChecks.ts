import { SupabaseClient } from '@supabase/supabase-js'

function todayIso() { return new Date().toISOString().slice(0, 10) }

// Once a check's due_date arrives, it's considered paid automatically (the money
// has left the bank) — no manual "שולם" click needed. Mirrors the expense-creation
// side effect of ScheduledPaymentsModal's manual markPaid() flow.
export async function autoMarkOverdueChecksPaid(supabase: SupabaseClient, tenantId: string) {
  const { data: due } = await supabase
    .from('scheduled_payments')
    .select('id, description, amount, due_date, supplier_id, category, notes')
    .eq('payment_method', 'check')
    .eq('is_paid', false)
    .lte('due_date', todayIso())

  if (!due || due.length === 0) return

  for (const p of due) {
    // Conditional update guards against two sessions racing on the same row.
    const upd = await supabase
      .from('scheduled_payments')
      .update({ is_paid: true, paid_date: p.due_date })
      .eq('id', p.id)
      .eq('is_paid', false)
      .select('id')
      .single()

    if (upd.error || !upd.data) continue

    const expRes = await supabase.from('expenses').insert({
      tenant_id:      tenantId,
      date:           p.due_date,
      category:       p.category ?? 'אחר',
      description:    p.description,
      amount:         p.amount,
      supplier_id:    p.supplier_id,
      payment_method: "צ'ק",
      payment_ref:    p.notes || null,
    }).select('id').single()

    if (!expRes.error && expRes.data) {
      await supabase.from('scheduled_payments').update({ expense_id: expRes.data.id }).eq('id', p.id)
    }
  }
}
