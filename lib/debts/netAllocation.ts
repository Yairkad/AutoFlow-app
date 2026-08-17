export interface NetAllocationDebtInput {
  id: string
  date: string   // ISO — for oldest-first ordering
  amount: number
  paid: number
}

export interface NetAllocationCreditInput {
  date: string   // ISO — a credit can only offset debts dated on/after it, never an earlier debt
  amount: number
}

// How much is actually payable per open debt after netting out open credit balances against
// it — oldest debt first, and for each debt only credits dated on or before that debt's own
// date are eligible (a credit can't retroactively reduce something owed before it existed).
// Debts fully absorbed by eligible credit (net <= 0) are omitted.
export function netAllocation(
  openChargeDebts: NetAllocationDebtInput[],
  openCredits: NetAllocationCreditInput[],
): Map<string, number> {
  const sortedDebts = [...openChargeDebts].sort((a, b) => a.date.localeCompare(b.date))
  const sortedCredits = [...openCredits].sort((a, b) => a.date.localeCompare(b.date))
  const creditRemaining = sortedCredits.map(c => Math.max(0, Number(c.amount)))
  const result = new Map<string, number>()
  for (const d of sortedDebts) {
    let gross = Math.max(0, Number(d.amount) - Number(d.paid))
    for (let i = 0; i < sortedCredits.length && gross > 0; i++) {
      if (sortedCredits[i].date > d.date) continue
      const avail = creditRemaining[i]
      if (avail <= 0) continue
      const use = Math.min(avail, gross)
      creditRemaining[i] -= use
      gross -= use
    }
    if (gross > 0) result.set(d.id, gross)
  }
  return result
}
