// Quick reports (worker terminal + office). Shapes shared by the API and the UI.

export interface QuickReport {
  canMoney: boolean
  sold: {
    cars: number
    total: number
    byType: Record<'tire' | 'product' | 'service', { qty: number; amount: number }>
    topTires: { label: string; qty: number }[]
  }
  received: {
    tires: number
    products: number
    cost: number
    topTires: { label: string; qty: number }[]
  }
}

export interface StockSummary {
  tireCount:      number   // units in stock
  tireModels:     number   // distinct tire rows with qty > 0
  costValue:      number   // Σ qty × cost_price
  sellValue:      number   // Σ qty × sell_price
  missingCost:    number   // tire rows in stock without cost price (not counted in costValue)
  lastReceiveDate: string | null
  lastCountDate:   string | null
}

export type RangeKey = 'today' | 'week' | 'month' | 'custom'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Range in the viewer's local time → the four params the reports API takes. */
export function rangeParams(key: RangeKey, customFrom?: string, customTo?: string) {
  const now = new Date()
  let from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let to   = new Date(from)
  if (key === 'week')  from.setDate(from.getDate() - from.getDay())   // since Sunday
  if (key === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1)
  if (key === 'custom' && customFrom && customTo) {
    from = new Date(customFrom + 'T00:00:00')
    to   = new Date(customTo + 'T00:00:00')
  }
  const toEnd = new Date(to); toEnd.setDate(toEnd.getDate() + 1)
  return {
    fromTs: from.toISOString(), toTs: toEnd.toISOString(),
    fromDate: ymd(from), toDate: ymd(to),
  }
}

export function daysAgoLabel(iso: string | null): { text: string; days: number | null } {
  if (!iso) return { text: 'אין נתון', days: null }
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
  return { text: days === 0 ? 'היום' : days === 1 ? 'אתמול' : `לפני ${days} ימים`, days }
}
