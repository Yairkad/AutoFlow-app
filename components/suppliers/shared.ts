// Shared types/helpers for the merged /suppliers page (SupplierDetailsTab + SupplierTrackingTab).

export type Direction = 'charge' | 'credit'

export interface Supplier {
  id: string
  tenant_id: string
  name: string
  category: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account: string | null
  bank_account_holder: string | null
  opening_balance: number
  created_at: string
}

export interface SupplierDebt {
  id: string
  tenant_id: string
  supplier_id: string | null
  amount: number
  paid: number
  description: string | null
  date: string
  is_closed: boolean
  created_at: string
  doc_type: string | null
  doc_number: string | null
  direction: Direction
  invoices: { type: string; number: string; amount: number; description?: string; drive_file_id?: string; drive_file_name?: string; drive_file_url?: string }[] | null
  drive_file_id: string | null
  drive_file_name: string | null
  drive_file_url: string | null
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

export interface ScheduledPayment {
  id: string; tenant_id: string; description: string; amount: number
  due_date: string; payment_method: 'check' | 'transfer'
  supplier_id: string | null; category: string | null
  is_paid: boolean; paid_date: string | null; expense_id: string | null; notes: string | null
  check_number: string | null; series_id: string | null; allocation_ignored: boolean
}

export interface SupplierDebtPayment {
  id: string; supplier_debt_id: string; scheduled_payment_id: string | null; amount: number
  created_at: string
}

export const fmt = (n: number) =>
  `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// is_closed is a manual "✓ סגור" override (independent of paid — see toggleClose):
// once a charge is closed, it contributes 0 to the balance regardless of paid vs
// amount, otherwise a manually-closed-but-not-fully-paid debt still displayed
// "שולם ✓" while silently still counting its unpaid remainder in every total.
export const bal = (d: { amount: number; paid: number; direction?: Direction; is_closed?: boolean }) => {
  if (d.direction === 'credit') return -Number(d.amount)
  if (d.is_closed) return 0
  return Math.max(0, Number(d.amount) - Number(d.paid))
}

// Format phone → WhatsApp URL
export const waUrl = (phone: string, text: string) => {
  let digits = phone.replace(/\D/g, '')
  if (!digits.startsWith('972')) digits = digits.startsWith('0') ? '972' + digits.slice(1) : '972' + digits
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
