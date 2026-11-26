import { SupabaseClient } from '@supabase/supabase-js'

const monthISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Creates this month's supplier charges from the active fixed recurring items (rent etc.) — the
 * same rows "צור חיובים לחודש" makes, without the click. Runs once per app load (ProfileContext).
 * An item that already has a charge this month is skipped; migration 122's unique index catches a
 * race between two tabs (each row is inserted on its own so one conflict doesn't block the rest).
 * Meter items are excluded (they're charged per reading). Returns how many charges it created.
 */
export async function autoCreateSupplierRecurringCharges(supabase: SupabaseClient, tenantId: string): Promise<number> {
  const month = monthISO()
  const [y, m] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const nextMonthStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data: items, error } = await supabase.from('recurring_items')
    .select('id, name, supplier_id, amount, valid_from')
    .eq('tenant_id', tenantId).eq('type', 'fixed').eq('active', true).not('supplier_id', 'is', null)
  if (error || !items?.length) return 0

  // Latest valid version per supplier + name (a new rate is a new item with a later valid_from)
  const best = new Map<string, (typeof items)[number]>()
  for (const it of items) {
    if (String(it.valid_from).slice(0, 7) > month) continue
    const key = `${it.supplier_id}__${it.name}`
    const prev = best.get(key)
    if (!prev || it.valid_from > prev.valid_from) best.set(key, it)
  }
  if (!best.size) return 0

  const ids = [...best.values()].map(it => it.id)
  const { data: existing, error: exErr } = await supabase.from('supplier_debts')
    .select('recurring_item_id').in('recurring_item_id', ids).gte('date', monthStart).lt('date', nextMonthStart)
  if (exErr) return 0
  const done = new Set((existing ?? []).map(d => d.recurring_item_id))

  let created = 0
  for (const it of best.values()) {
    if (done.has(it.id)) continue
    const { error: insErr } = await supabase.from('supplier_debts').insert({
      tenant_id: tenantId, supplier_id: it.supplier_id, amount: it.amount ?? 0, paid: 0,
      description: it.name, date: monthStart, is_closed: false, doc_type: 'invoice',
      direction: 'charge', invoices: [], recurring_item_id: it.id,
    })
    if (!insErr) created++
  }
  return created
}
