import { SupabaseClient } from '@supabase/supabase-js'

export interface BankStatementLineRow {
  id: string
  date: string
  description: string
  direction: 'debit' | 'credit'
  amount: number
  status: string
  source_id: string | null
}

export interface MatchCandidate {
  id: string           // expense.id or income.id
  date: string
  category: string
  description: string
  amount: number
  dateDiffDays: number
}

// Bulk (not per-line) match suggestion: one query per direction against
// expenses/income, filtered in memory to an exact amount match within the
// source's day-tolerance window (card settlement lag) and sorted by date
// proximity. Amounts are matched exactly (real currency, no fuzzy matching)
// per the confirmed "suggest, never auto-commit" reconciliation philosophy
// already used elsewhere in this app (see lib/debts/reconcileSupplierPayment.ts).
export async function suggestMatchesForLines(
  supabase: SupabaseClient,
  tenantId: string,
  lines: BankStatementLineRow[],
  toleranceDaysBySource: Map<string, number>,
): Promise<Map<string, MatchCandidate[]>> {
  const result = new Map<string, MatchCandidate[]>()
  if (lines.length === 0) return result

  const debitLines  = lines.filter(l => l.direction === 'debit')
  const creditLines = lines.filter(l => l.direction === 'credit')

  const [debitPool, creditPool, claimedExpenseIds, claimedIncomeIds] = await Promise.all([
    debitLines.length
      ? supabase.from('expenses').select('id, date, category, description, amount').eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] as any[] }),
    creditLines.length
      ? supabase.from('income').select('id, date, category, description, amount').eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('bank_statement_lines').select('matched_expense_id').eq('tenant_id', tenantId).not('matched_expense_id', 'is', null),
    supabase.from('bank_statement_lines').select('matched_income_id').eq('tenant_id', tenantId).not('matched_income_id', 'is', null),
  ])

  const claimedExpense = new Set((claimedExpenseIds.data ?? []).map((r: any) => r.matched_expense_id as string))
  const claimedIncome  = new Set((claimedIncomeIds.data ?? []).map((r: any) => r.matched_income_id as string))

  const dayDiff = (a: string, b: string) =>
    Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)

  for (const line of debitLines) {
    const tolerance = toleranceDaysBySource.get(line.source_id ?? '') ?? 3
    const candidates = (debitPool.data ?? [])
      .filter((e: any) => !claimedExpense.has(e.id) && Number(e.amount) === Number(line.amount))
      .map((e: any) => ({ ...e, dateDiffDays: Math.abs(dayDiff(e.date, line.date)) }))
      .filter((e: any) => e.dateDiffDays <= tolerance)
      .sort((a: any, b: any) => a.dateDiffDays - b.dateDiffDays)
    result.set(line.id, candidates)
  }

  for (const line of creditLines) {
    const tolerance = toleranceDaysBySource.get(line.source_id ?? '') ?? 3
    const candidates = (creditPool.data ?? [])
      .filter((e: any) => !claimedIncome.has(e.id) && Number(e.amount) === Number(line.amount))
      .map((e: any) => ({ ...e, dateDiffDays: Math.abs(dayDiff(e.date, line.date)) }))
      .filter((e: any) => e.dateDiffDays <= tolerance)
      .sort((a: any, b: any) => a.dateDiffDays - b.dateDiffDays)
    result.set(line.id, candidates)
  }

  return result
}
