import { SupabaseClient } from '@supabase/supabase-js'

export interface ForecastEvent {
  date: string
  label: string
  amount: number // signed: negative = outflow, positive = inflow
  runningBalance: number
  source: 'scheduled' | 'recurring_item' | 'recurring_expense' | 'card_charge'
}

export interface ForecastResult {
  anchorBalance: number | null
  anchorDate: string | null
  anchorSourceName: string | null
  events: ForecastEvent[]
  horizonDays: number
}

const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Clamps a day-of-month onto a specific year/month, landing on that month's
// last real day if it's shorter (e.g. day 31 in February).
function dateInMonth(year: number, monthIndex0: number, day: number): string {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate()
  const d = new Date(year, monthIndex0, Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

// Projects a recurring monthly (or bimonthly) event forward from a reference
// date, returning every occurrence strictly after `after` and up to and
// including `until`.
function projectMonthly(referenceIso: string, stepMonths: number, day: number, after: string, until: string): string[] {
  const ref = new Date(referenceIso + 'T00:00:00')
  const out: string[] = []
  let y = ref.getFullYear(), m = ref.getMonth()
  for (let i = 0; i < 60; i++) { // hard cap, well beyond any realistic horizon
    const candidate = dateInMonth(y, m, day)
    if (candidate > until) break
    if (candidate > after) out.push(candidate)
    m += stepMonths
    y += Math.floor(m / 12)
    m = ((m % 12) + 12) % 12
  }
  return out
}

// Builds a forward cash-flow projection anchored on the most recent bank/credit
// statement's known balance (balance_after), fed by scheduled checks/transfers,
// known-amount recurring items/expenses, and already-imported credit-card
// transactions that haven't posted to the bank yet. Deliberately excludes open
// supplier/customer debts (no reliable due date) and recurring_items of
// type='meter' (amount unknown until a reading is entered) — only dated,
// known-amount commitments are projected, per the "suggest, don't guess"
// philosophy used throughout this app's money-matching features.
//
// Card charges are keyed by charge_date (when the money actually leaves the
// bank), never by the transaction's own `date` (when the purchase happened,
// which is what reconciliation matching uses instead) — a credit-card
// statement's transactions are typically all billed together weeks after
// they happened, so using the transaction date here would place the outflow
// far too early relative to the anchor balance.
export async function buildForecast(
  supabase: SupabaseClient,
  tenantId: string,
  horizonDays = 60,
): Promise<ForecastResult> {
  const { data: anchorLine } = await supabase
    .from('bank_statement_lines')
    .select('date, balance_after, source_id')
    .eq('tenant_id', tenantId)
    .not('balance_after', 'is', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!anchorLine) {
    return { anchorBalance: null, anchorDate: null, anchorSourceName: null, events: [], horizonDays }
  }

  const anchorDate = anchorLine.date as string
  const anchorBalance = Number(anchorLine.balance_after)
  const until = addDays(anchorDate, horizonDays)

  let anchorSourceName: string | null = null
  if (anchorLine.source_id) {
    const { data: src } = await supabase.from('bank_statement_sources').select('name').eq('id', anchorLine.source_id).maybeSingle()
    anchorSourceName = src?.name ?? null
  }

  const [scheduledRes, recurringItemsRes, recurringExpensesRes, cardChargesRes] = await Promise.all([
    supabase.from('scheduled_payments').select('description, amount, due_date').eq('tenant_id', tenantId).eq('is_paid', false).gt('due_date', anchorDate).lte('due_date', until),
    supabase.from('recurring_items').select('name, amount, supplier_id, customer_id, type, valid_from, active').eq('tenant_id', tenantId).eq('active', true).eq('type', 'fixed'),
    supabase.from('recurring_expenses').select('description, amount, frequency, is_active, is_variable, last_applied, created_at').eq('tenant_id', tenantId).eq('is_active', true).eq('is_variable', false),
    supabase.from('bank_statement_lines').select('description, amount, direction, charge_date').eq('tenant_id', tenantId).not('charge_date', 'is', null).neq('status', 'ignored').gt('charge_date', anchorDate).lte('charge_date', until),
  ])

  const events: Omit<ForecastEvent, 'runningBalance'>[] = []

  for (const p of scheduledRes.data ?? []) {
    events.push({ date: p.due_date, label: p.description, amount: -Number(p.amount), source: 'scheduled' })
  }

  for (const c of cardChargesRes.data ?? []) {
    events.push({ date: c.charge_date, label: c.description, amount: c.direction === 'debit' ? -Number(c.amount) : Number(c.amount), source: 'card_charge' })
  }

  for (const it of recurringItemsRes.data ?? []) {
    if (it.amount == null) continue
    const validFrom = it.valid_from as string
    const day = Number(validFrom.slice(8, 10)) || 1
    const dates = projectMonthly(validFrom, 1, day, anchorDate, until)
    const signed = it.supplier_id ? -Number(it.amount) : Number(it.amount)
    dates.forEach(date => events.push({ date, label: it.name, amount: signed, source: 'recurring_item' }))
  }

  for (const re of recurringExpensesRes.data ?? []) {
    if (re.amount == null) continue
    const step = re.frequency === 'bimonthly' ? 2 : 1
    const referenceIso = re.last_applied ? `${re.last_applied}-01` : (re.created_at as string).slice(0, 10)
    const dates = projectMonthly(referenceIso, step, 1, anchorDate, until)
    dates.forEach(date => events.push({ date, label: re.description, amount: -Number(re.amount), source: 'recurring_expense' }))
  }

  events.sort((a, b) => a.date.localeCompare(b.date))
  let running = anchorBalance
  const withRunning: ForecastEvent[] = events.map(ev => {
    running += ev.amount
    return { ...ev, runningBalance: running }
  })

  return { anchorBalance, anchorDate, anchorSourceName, events: withRunning, horizonDays }
}
