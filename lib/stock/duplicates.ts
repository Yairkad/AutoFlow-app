import { normalizeSearch } from '@/lib/search/fuzzy'

// Finds records that are probably the same item entered twice (e.g. one with prices, one without).
// Records sharing any key end up in one group (a chain A~B, B~C → one group A,B,C).

export interface DupGroup<T> { items: T[]; reasons: string[] }

interface TireLike {
  id: string; brand: string | null; width: number | null; profile: number | null; rim: number | null
  load_idx: string | null; speed_idx: string | null; sku: string | null
  condition?: string | null; tire_type?: string | null
}
interface ProductLike { id: string; name: string; sku: string | null; barcode: string | null }

const compact = (s: string | null | undefined) => normalizeSearch(s ?? '').replace(/\s+/g, '')

function group<T extends { id: string }>(items: T[], keysOf: (t: T) => [key: string, reason: string][]): DupGroup<T>[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p); parent.set(x, r); return r
  }
  const owner  = new Map<string, string>()        // key → first item id with it
  const reason = new Map<string, Set<string>>()   // item id → why it is in a group
  for (const it of items) {
    for (const [key, why] of keysOf(it)) {
      const other = owner.get(key)
      if (!other) { owner.set(key, it.id); continue }
      parent.set(find(it.id), find(other))
      for (const id of [it.id, other]) {
        if (!reason.has(id)) reason.set(id, new Set())
        reason.get(id)!.add(why)
      }
    }
  }
  const byRoot = new Map<string, T[]>()
  for (const it of items) {
    if (!reason.has(it.id)) continue
    const r = find(it.id)
    byRoot.set(r, [...(byRoot.get(r) ?? []), it])
  }
  return [...byRoot.values()]
    .filter(g => g.length > 1)
    .map(g => ({ items: g, reasons: [...new Set(g.flatMap(i => [...reason.get(i.id)!]))] }))
}

export function findTireDuplicates<T extends TireLike>(tires: T[]): DupGroup<T>[] {
  return group(tires, t => {
    const keys: [string, string][] = []
    if (t.width && t.profile && t.rim) {
      keys.push([
        ['size', compact(t.brand), t.width, t.profile, t.rim, compact(t.load_idx), compact(t.speed_idx),
          t.condition ?? '', t.tire_type ?? ''].join('|'),
        'אותו יצרן ומידה',
      ])
    }
    if (compact(t.sku)) keys.push([`sku|${compact(t.sku)}`, 'אותו ברקוד/מק״ט'])
    return keys
  })
}

export function findProductDuplicates<T extends ProductLike>(products: T[]): DupGroup<T>[] {
  return group(products, p => {
    const keys: [string, string][] = []
    if (compact(p.name)) keys.push([`name|${compact(p.name)}`, 'אותו שם'])
    // A code may sit in either field, so sku and barcode share one key space
    for (const c of new Set([compact(p.sku), compact(p.barcode)])) if (c) keys.push([`code|${c}`, 'אותו ברקוד/מק״ט'])
    return keys
  })
}

/** The record to keep by default: has a sell price, then most stock, then the oldest. */
export function pickKeeper<T extends { sell_price: number | null; qty: number; created_at?: string }>(items: T[]): T {
  return [...items].sort((a, b) =>
    Number((b.sell_price ?? 0) > 0) - Number((a.sell_price ?? 0) > 0) ||
    b.qty - a.qty ||
    (a.created_at ?? '').localeCompare(b.created_at ?? ''))[0]
}
