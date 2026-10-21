// Worker-hub records: loans between tire shops and customers waiting for a tire.
// Shared by the yard screens, the office "מעקב רחבה" page and the API routes.

export type LoanDirection = 'borrowed' | 'lent'
export type LoanStatus    = 'open' | 'returned' | 'paid'

export interface TireLoan {
  id:              string
  tenant_id:       string
  direction:       LoanDirection
  shop_name:       string
  shop_phone:      string | null
  loan_date:       string
  item_desc:       string
  tire_id:         string | null
  qty:             number
  customer_name:   string | null
  plate:           string | null
  session_id:      string | null
  status:          LoanStatus
  amount:          number | null
  closed_at:       string | null
  notes:           string | null
  created_by_name: string | null
  created_at:      string
}

export type RequestKind   = 'order' | 'inquiry'
export type RequestStatus = 'new' | 'ordered' | 'arrived' | 'notified' | 'closed' | 'cancelled'

export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid:  'לא שולם',
  partial: 'שולם חלקית',
  paid:    'שולם',
}

export interface CustomerRequest {
  id:              string
  tenant_id:       string
  kind:            RequestKind
  customer_name:   string
  phone:           string | null
  plate:           string | null
  item_desc:       string
  tire_width:      number | null
  tire_profile:    number | null
  tire_rim:        number | null
  qty:             number
  quoted_price:    number | null
  status:          RequestStatus
  notes:           string | null
  created_by_name: string | null
  created_at:      string
  payment_status:  PaymentStatus
  paid_amount:     number | null
  supplier_name:   string | null
  install_at:      string | null
  updated_at:      string
}

export const OPEN_REQUEST_STATUSES: RequestStatus[] = ['new', 'ordered', 'arrived', 'notified']
/** Still waiting for the tire itself — these get the "it just arrived" alert on receive. */
export const WAITING_STATUSES: RequestStatus[] = ['new', 'ordered']

export const LOAN_DIRECTION_LABEL: Record<LoanDirection, string> = {
  borrowed: 'קיבלנו מהם',
  lent:     'נתנו להם',
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  open:     'פתוח',
  returned: 'הוחזר',
  paid:     'שולם',
}

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  order:   'הזמנה — מחכה לצמיג',
  inquiry: 'בירור',
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new:       'חדש',
  ordered:   'הוזמן מספק',
  arrived:   'הגיע',
  notified:  'עודכן הלקוח',
  closed:    'סגור',
  cancelled: 'בוטל',
}

/** Next step offered as the main button on a request card. */
export const REQUEST_NEXT: Partial<Record<RequestStatus, RequestStatus>> = {
  new:      'ordered',
  ordered:  'arrived',
  arrived:  'notified',
  notified: 'closed',
}

/** Open loans older than this are highlighted. */
export const LOAN_STALE_DAYS = 7

export function daysSince(iso: string): number {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

/** wa.me link from an Israeli phone number ("050-1234567" → 972501234567). */
export function whatsappLink(phone: string, text?: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '972' + digits.slice(1)
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
