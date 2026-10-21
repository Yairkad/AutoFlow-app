import type { TirePosition, YardSession } from '@/lib/yard/types'

// Search pages hand the chosen items to the work card through sessionStorage and
// navigate back; the work card saves them itself (WorkCardClient → addItems).

export interface HandoffItem {
  item_type: 'tire' | 'product' | 'service'
  ref_id: string | null
  name: string
  sku: string | null
  quantity: number
  unit_price: number
  original_price: number
  price_modified: boolean
  tire_position: TirePosition | null
  no_stock?: boolean
}

export function handOffToCard(sessionId: string, items: HandoffItem[], replaceIds: string[] = []) {
  try { sessionStorage.setItem(`yard-pending-${sessionId}`, JSON.stringify({ items, replaceIds })) } catch {}
}

/** Tires already on the card by position — for TirePositionPicker's "replace?" question */
export function occupiedPositions(session: YardSession): Partial<Record<TirePosition, string>> {
  const out: Partial<Record<TirePosition, string>> = {}
  for (const i of session.yard_session_items ?? []) if (i.item_type === 'tire' && i.tire_position) out[i.tire_position] = i.name
  return out
}

/** Ids of the card's tires sitting at these positions */
export function tireIdsAt(session: YardSession, positions: TirePosition[]): string[] {
  return (session.yard_session_items ?? [])
    .filter(i => i.item_type === 'tire' && i.tire_position && positions.includes(i.tire_position))
    .map(i => i.id)
}
