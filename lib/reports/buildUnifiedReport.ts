import { SupabaseClient } from '@supabase/supabase-js'
import { bal as supplierBal } from '@/components/suppliers/shared'
import { netAmount as customerLedgerNet, balanceOf as customerLedgerBalanceOf } from '@/lib/debts/ledger'

export interface MonthlyReportRow {
  month: string // 'YYYY-MM'
  incomeActual: number
  expenseActual: number
  profitActual: number
  customerLedgerRecognized: number   // Σ netAmount of customer_ledger_debts dated this month (accrual revenue, regardless of collection)
  occasionalCustomerOpen: number     // Σ open balance of customer_debts (ad-hoc debtors) dated this month, still unpaid today
  supplierOpen: number               // Σ open balance of supplier_debts dated this month, still unpaid today
  scheduledUnpaid: number            // Σ scheduled_payments (checks/transfers) due this month, still unpaid today
  adjustedProfit: number             // profitActual + customerLedgerRecognized + occasionalCustomerOpen − supplierOpen − scheduledUnpaid
}

export interface UnifiedReportResult {
  rows: MonthlyReportRow[]
  totalOpenCustomerLedgerBalance: number // single today's-total across all ledger customers (Σcharges−Σcredits−Σpayments) — not splittable per month, since payments aren't tied to specific invoices in this model
}

const monthKeyOf = (iso: string) => iso.slice(0, 7)

// Aggregates the existing income/expenses actuals together with everything the
// existing 'summary' tab in ExpensesClient.tsx does NOT show: unpaid scheduled
// checks/transfers, and open (still-unpaid-today) supplier/customer debts,
// bucketed by the month they belong to. Deliberately reuses the same bal()/
// netAmount() helpers already used on the suppliers/customers pages, rather
// than re-deriving balance math a third time.
//
// Income/expense rows created from a reconciled credit-card statement line
// (see components/bank-sync) are bucketed by that line's charge_date when one
// exists, not by the row's own `date` (the transaction date). This is
// deliberate: a card statement bills many transaction-dated purchases
// together on one future charge date, and this report is meant to reflect
// cash-basis reality (when money actually left the bank), unlike the
// itemized expense LIST (ExpensesClient.tsx), which is untouched and keeps
// showing each transaction on its own real date -- this file is the only
// place charge_date re-bucketing happens. Looked up via bank_statement_lines
// (matched_expense_id/matched_income_id → charge_date) rather than a column
// on expenses/income itself, keeping the FK direction this feature already
// established (bank_statement_lines points at expenses/income, never back).
export async function buildUnifiedReport(
  supabase: SupabaseClient,
  tenantId: string,
  monthsBack = 12,
): Promise<UnifiedReportResult> {
  const today = new Date()
  const monthKeys: string[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const earliestDate = `${monthKeys[0]}-01`

  const [incomeRes, expensesRes, supplierDebtsRes, custLedgerDebtsRes, custLedgerPaymentsRes, occasionalDebtsRes, scheduledRes, chargeDatesRes] = await Promise.all([
    supabase.from('income').select('id, date, amount').eq('tenant_id', tenantId).gte('date', earliestDate),
    supabase.from('expenses').select('id, date, amount').eq('tenant_id', tenantId).gte('date', earliestDate),
    supabase.from('supplier_debts').select('date, amount, paid, direction, is_closed').eq('tenant_id', tenantId).gte('date', earliestDate),
    supabase.from('customer_ledger_debts').select('date, amount, direction').eq('tenant_id', tenantId).gte('date', earliestDate),
    supabase.from('customer_ledger_payments').select('amount').eq('tenant_id', tenantId),
    supabase.from('customer_debts').select('date, amount, paid, is_closed').eq('tenant_id', tenantId).gte('date', earliestDate),
    supabase.from('scheduled_payments').select('due_date, amount, is_paid').eq('tenant_id', tenantId).eq('is_paid', false),
    supabase.from('bank_statement_lines').select('matched_expense_id, matched_income_id, charge_date').eq('tenant_id', tenantId).not('charge_date', 'is', null),
  ])

  const income = incomeRes.data ?? []
  const expenses = expensesRes.data ?? []
  const supplierDebts = supplierDebtsRes.data ?? []
  const custLedgerDebts = custLedgerDebtsRes.data ?? []
  const occasionalDebts = occasionalDebtsRes.data ?? []
  const scheduled = scheduledRes.data ?? []

  const expenseChargeDate = new Map<string, string>()
  const incomeChargeDate = new Map<string, string>()
  for (const l of chargeDatesRes.data ?? []) {
    if (l.matched_expense_id) expenseChargeDate.set(l.matched_expense_id, l.charge_date)
    if (l.matched_income_id) incomeChargeDate.set(l.matched_income_id, l.charge_date)
  }
  const effectiveExpenseMonth = (r: { id: string; date: string }) => monthKeyOf(expenseChargeDate.get(r.id) ?? r.date)
  const effectiveIncomeMonth = (r: { id: string; date: string }) => monthKeyOf(incomeChargeDate.get(r.id) ?? r.date)

  // Customer-ledger balance is account-level, not per-invoice (see lib/debts/ledger.ts) —
  // the only correct "open" figure is one all-time total, computed the same way the
  // customer tracking page does, not split per month.
  const allCustLedgerDebtsRes = await supabase.from('customer_ledger_debts').select('amount, direction').eq('tenant_id', tenantId)
  const allCustLedgerDebts = allCustLedgerDebtsRes.data ?? []
  const totalOpenCustomerLedgerBalance = customerLedgerBalanceOf(allCustLedgerDebts, custLedgerPaymentsRes.data ?? [])

  const rows: MonthlyReportRow[] = monthKeys.map(month => {
    const incomeActual = income.filter(r => effectiveIncomeMonth(r) === month).reduce((s, r) => s + Number(r.amount), 0)
    const expenseActual = expenses.filter(r => effectiveExpenseMonth(r) === month).reduce((s, r) => s + Number(r.amount), 0)
    const customerLedgerRecognized = custLedgerDebts.filter(r => monthKeyOf(r.date) === month).reduce((s, r) => s + customerLedgerNet(r), 0)
    const occasionalCustomerOpen = occasionalDebts.filter(r => monthKeyOf(r.date) === month)
      .reduce((s, r) => s + (r.is_closed ? 0 : Math.max(0, Number(r.amount) - Number(r.paid))), 0)
    const supplierOpen = supplierDebts.filter(r => monthKeyOf(r.date) === month).reduce((s, r) => s + supplierBal(r), 0)
    const scheduledUnpaid = scheduled.filter(r => monthKeyOf(r.due_date) === month).reduce((s, r) => s + Number(r.amount), 0)
    const profitActual = incomeActual - expenseActual
    const adjustedProfit = profitActual + customerLedgerRecognized + occasionalCustomerOpen - supplierOpen - scheduledUnpaid

    return { month, incomeActual, expenseActual, profitActual, customerLedgerRecognized, occasionalCustomerOpen, supplierOpen, scheduledUnpaid, adjustedProfit }
  })

  return { rows, totalOpenCustomerLedgerBalance }
}
