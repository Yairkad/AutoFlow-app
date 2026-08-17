export interface NetAllocationDebtInput {
  id: string
  date: string   // ISO — for oldest-first ordering
  amount: number
  paid: number
}

// How much is actually payable per open debt after netting out an open credit balance
// against the oldest debts first. Debts fully absorbed by credit (net <= 0) are omitted.
export function netAllocation(
  openChargeDebts: NetAllocationDebtInput[],
  openCreditTotal: number,
): Map<string, number> {
  const sorted = [...openChargeDebts].sort((a, b) => a.date.localeCompare(b.date))
  let creditLeft = Math.max(0, openCreditTotal)
  const result = new Map<string, number>()
  for (const d of sorted) {
    const gross = Math.max(0, Number(d.amount) - Number(d.paid))
    const reduceBy = Math.min(gross, creditLeft)
    creditLeft -= reduceBy
    const net = gross - reduceBy
    if (net > 0) result.set(d.id, net)
  }
  return result
}
