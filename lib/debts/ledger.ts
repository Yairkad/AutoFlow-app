// Shared balance math for the simplified customer/supplier ledger model: a total is just
// Σ(charges) − Σ(credits) − Σ(payments), computed straight from raw amounts. Nothing here
// depends on a per-debt paid/is_closed field — that's the whole point (see bug-020: is_closed
// used to silently diverge from the real payment total once set independently of paid).

export type Direction = 'charge' | 'credit'

export const netAmount = (d: { amount: number; direction?: Direction }) =>
  d.direction === 'credit' ? -Number(d.amount) : Number(d.amount)

export const balanceOf = (
  debts: { amount: number; direction?: Direction }[],
  payments: { amount: number }[],
) => debts.reduce((s, d) => s + netAmount(d), 0) - payments.reduce((s, p) => s + Number(p.amount), 0)

export interface RawLedgerEvent<T> {
  date: string
  delta: number // signed effect on the balance: +amount for a charge, -amount for a credit or payment
  data: T
}

export interface LedgerEvent<T> extends RawLedgerEvent<T> {
  runningBalance: number
}

// Sorts events chronologically and threads a running balance through them — the single
// implementation both the on-screen month view and the printed ledger build their rows from,
// so the two can never show different numbers for the same account.
export function buildLedger<T>(events: RawLedgerEvent<T>[], openingBalance = 0): LedgerEvent<T>[] {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  let running = openingBalance
  return sorted.map(ev => {
    running += ev.delta
    return { ...ev, runningBalance: running }
  })
}
