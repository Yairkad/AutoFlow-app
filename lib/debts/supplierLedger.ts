// Supplier running account: one balance per supplier, threaded through time. Invoices add,
// credit notes and payments subtract — each on its own date — so a payment or a credit no
// longer has to be "moved" between months: a month is just a window on the running balance
// (opening → charges / credits / payments → closing). Display-only; nothing here writes.

export type SupplierLedgerKind = 'charge' | 'credit' | 'payment' | 'writeoff'

export interface SupplierLedgerEvent {
  date: string            // YYYY-MM-DD
  kind: SupplierLedgerKind
  amount: number          // always positive; kind decides the sign
  debtId?: string
  paymentId?: string      // scheduled_payments.id
}

export interface SupplierMonthSummary {
  opening: number; charges: number; credits: number; payments: number; closing: number
}

interface DebtIn { id: string; date: string; amount: number; paid: number; direction?: string | null; is_closed?: boolean }
interface AllocIn { supplier_debt_id: string; scheduled_payment_id: string | null; amount: number; created_at: string }
interface PayIn { id: string; amount: number; due_date: string; is_paid: boolean; allocation_ignored?: boolean | null }

const sign = (k: SupplierLedgerKind) => (k === 'charge' ? 1 : -1)
export const monthOf = (iso: string) => iso.slice(0, 7)

/**
 * Events of one supplier. A payment counts when it was allocated to an invoice, marked paid,
 * or its date has arrived (a future transfer nobody allocated yet doesn't count early);
 * "allocation ignored" payments never count. A charge closed by hand ("✓ סגור") without being
 * fully paid gets a write-off for the rest, so its balance stays 0 as before.
 */
export function supplierEvents(debts: DebtIn[], allocations: AllocIn[], payments: PayIn[], today: string): SupplierLedgerEvent[] {
  const ids = new Set(debts.map(d => d.id))
  const mine = allocations.filter(a => ids.has(a.supplier_debt_id))
  const linked = new Set(mine.map(a => a.scheduled_payment_id).filter(Boolean) as string[])
  const payIds = new Set(payments.map(p => p.id))
  const ev: SupplierLedgerEvent[] = []
  for (const d of debts) {
    const amt = Number(d.amount)
    if (d.direction === 'credit') { ev.push({ date: d.date, kind: 'credit', amount: amt, debtId: d.id }); continue }
    ev.push({ date: d.date, kind: 'charge', amount: amt, debtId: d.id })
    if (d.is_closed && amt - Number(d.paid) > 0.005) ev.push({ date: d.date, kind: 'writeoff', amount: amt - Number(d.paid), debtId: d.id })
  }
  for (const p of payments) {
    if (p.allocation_ignored) continue
    if (!linked.has(p.id) && !p.is_paid && p.due_date > today) continue
    ev.push({ date: p.due_date, kind: 'payment', amount: Number(p.amount), paymentId: p.id })
  }
  // Allocations with no payment row of this supplier (direct / bank-matched payments)
  for (const a of mine) {
    if (a.scheduled_payment_id && payIds.has(a.scheduled_payment_id)) continue
    ev.push({ date: a.created_at.slice(0, 10), kind: 'payment', amount: Number(a.amount) })
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date) || sign(b.kind) - sign(a.kind))
}

export const balanceAfter = (events: SupplierLedgerEvent[], beforeDate?: string) =>
  events.filter(e => !beforeDate || e.date < beforeDate).reduce((s, e) => s + sign(e.kind) * e.amount, 0)

/** Per-month window on the running balance, for every month that has any event. */
export function monthSummaries(events: SupplierLedgerEvent[], opening = 0): Record<string, SupplierMonthSummary> {
  const out: Record<string, SupplierMonthSummary> = {}
  let running = opening
  for (const e of events) {
    const mk = monthOf(e.date)
    const m = out[mk] ?? (out[mk] = { opening: running, charges: 0, credits: 0, payments: 0, closing: running })
    if (e.kind === 'charge') m.charges += e.amount
    else if (e.kind === 'credit') m.credits += e.amount
    else m.payments += e.amount
    running += sign(e.kind) * e.amount
    m.closing = running
  }
  return out
}
