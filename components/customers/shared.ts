// Shared types/helpers for the merged /customers page (CustomerDetailsTab + CustomerTrackingTab).

export type Direction = 'charge' | 'credit'

export interface Customer {
  id: string
  tenant_id: string
  name: string
  category: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  opening_balance: number
  created_at: string
}

export interface CustomerLedgerDebt {
  id: string
  tenant_id: string
  customer_id: string | null
  amount: number
  paid: number
  description: string | null
  date: string
  is_closed: boolean
  created_at: string
  doc_type: string | null
  doc_number: string | null
  direction: Direction
  invoices: { type: string; number: string; amount: number; description?: string }[] | null
  recurring_item_id: string | null
  meter_prev: number | null
  meter_curr: number | null
  price_per_unit: number | null
  fixed_addon: number | null
  period_start: string | null
  period_end: string | null
}

export interface RecurringItem {
  id: string
  tenant_id: string
  name: string
  supplier_id: string | null
  customer_id: string | null
  type: 'fixed' | 'meter'
  amount: number | null
  price_per_unit: number | null
  fixed_addon: number | null
  valid_from: string
  active: boolean
  created_at: string
}

// customer_ledger_debt_id is null for every payment recorded under the simplified model
// (2026-08-18 redesign) — a payment is attributed to customer_id directly and is never
// allocated to specific invoices. Only historical rows (pre-redesign) still carry a debt id.
export interface CustomerLedgerPayment {
  id: string; customer_id: string; customer_ledger_debt_id: string | null; amount: number
  payment_method: string; check_number: string | null; check_date: string | null
  payment_date: string | null; receipt_issued: boolean; receipt_number: string | null
  notes: string | null; created_at: string; payment_group_id: string | null
}

export const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// The balance is Σcharges − Σcredits − Σpayments (lib/debts/ledger.ts) — it no longer depends
// on any per-debt paid/is_closed bookkeeping. is_closed is now purely a manual, cosmetic
// "🏷 מכוסה" reference tag with zero effect on the balance (see bug-020, which happened
// precisely because is_closed used to affect the balance while being settable independently
// of the actual paid amount).
export { netAmount as bal, balanceOf, buildLedger } from '@/lib/debts/ledger'

export const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('972')) digits = digits.startsWith('0') ? '972' + digits.slice(1) : '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
