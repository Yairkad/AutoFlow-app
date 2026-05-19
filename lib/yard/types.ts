export type TirePosition = 'FL' | 'FR' | 'RL' | 'RR'

export interface YardSessionItem {
  id:             string
  session_id:     string
  tenant_id:      string
  item_type:      'tire' | 'product' | 'service'
  ref_id:         string | null
  name:           string
  sku:            string | null
  quantity:       number
  unit_price:     number
  original_price: number
  price_modified: boolean
  tire_position:  TirePosition | null
  created_at:     string
}

export interface YardSession {
  id:                 string
  tenant_id:          string
  plate:              string
  make:               string | null
  model:              string | null
  year:               string | null
  status:             'active' | 'pending_office' | 'archived'
  opened_at:          string
  opened_by:          string | null
  closed_at:          string | null
  closed_by:          string | null
  yard_session_items: YardSessionItem[]
}

export interface YardService {
  id:         string
  tenant_id:  string
  name:       string
  sku:        string | null
  price:      number
  is_active:  boolean
  sort_order: number
}

export function sessionDisplayName(s: YardSession): string {
  if (s.make && s.model) return `${s.make} ${s.model}`
  if (s.make) return s.make
  return s.plate
}

export function formatPlate(plate: string): string {
  const d = plate.replace(/\D/g, '')
  if (d.length <= 7) {
    // 2-3-2
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0,2)}-${d.slice(2)}`
    return `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`
  }
  // 3-2-3
  return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5,8)}`
}

export function sessionTotal(items: YardSessionItem[]): number {
  return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
}

export function minutesSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

export interface SearchResult {
  id:     string
  type:   'tire' | 'product' | 'service'
  name:   string
  sku:    string | null
  price:  number
  stock:  number | null
  size?:  string
  brand?: string
}
