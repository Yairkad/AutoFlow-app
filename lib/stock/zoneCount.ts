// Inventory count by zone (cabinets / shelves). Pure logic shared by the yard and office screens;
// the API only applies the result (app/api/yard/zone-count).

import { tireSizeText } from '@/lib/tires/size'
import { formatLocation, isKnownShelf, isSplit, parseLocation, sortShelves, type StorageLayout } from './storage'

export interface ZoneTire {
  id: string
  sku: string | null
  brand: string | null
  width: number | null
  profile: number | null
  rim: number | null
  qty: number
  location: string | null
}

export interface ZoneEntry {
  key: string                       // 'id:<tireId>' | 'sku:<barcode>' (unknown)
  tireId: string | null
  sku: string
  label: string
  byShelf: Record<string, number>   // shelf → units found there
}

/** For a tire that was recorded outside the counted shelves: it moved here, or it's in both places. */
export type OutsideChoice = 'move' | 'both'

export interface ZoneCountSave {
  shelves: string[]
  notes?: string
  updates: { tireId: string; qty: number; location: string | null; counted: number; systemQty: number; label: string; sku: string | null }[]
  creates: { sku: string | null; qty: number; location: string | null; label: string; brand?: string | null; width?: number | null; profile?: number | null; rim?: number | null }[]
}

export function tireLabel(t: ZoneTire): string {
  return [t.brand, tireSizeText(t)].filter(Boolean).join(' ') || t.sku || 'צמיג ללא פרטים'
}

export const entryTotal = (e: ZoneEntry) => Object.values(e.byShelf).reduce((a, b) => a + b, 0)
export const entryShelves = (e: ZoneEntry) => sortShelves(Object.keys(e.byShelf).filter(s => e.byShelf[s] > 0))

/**
 * A tire recorded on a counted shelf AND on a shelf outside the picked area can only be counted
 * whole — add its other shelves to the count. Repeats until nothing changes.
 */
export function expandScope(layout: StorageLayout, picked: string[], tires: ZoneTire[]): { scope: string[]; added: string[] } {
  const scope = new Set(picked)
  let grew = true
  while (grew) {
    grew = false
    for (const t of tires) {
      const shelves = parseLocation(t.location).filter(s => isKnownShelf(layout, s))
      if (!shelves.some(s => scope.has(s))) continue
      for (const s of shelves) if (!scope.has(s)) { scope.add(s); grew = true }
    }
  }
  return { scope: sortShelves([...scope]), added: sortShelves([...scope].filter(s => !picked.includes(s))) }
}

/** Tires the system thinks are on these shelves. */
export function expectedTires(tires: ZoneTire[], scope: string[]): ZoneTire[] {
  const set = new Set(scope)
  return tires.filter(t => parseLocation(t.location).some(s => set.has(s)))
}

export type ReviewKind = 'ok' | 'diff' | 'moved' | 'missing' | 'new'

export interface ReviewRow {
  key: string
  kind: ReviewKind
  label: string
  sku: string | null
  tire: ZoneTire | null
  counted: number
  systemQty: number | null
  oldLocation: string | null
  outside: string[]            // recorded shelves outside this count (moved / also there)
  newQty: number
  newLocation: string | null
  split: boolean               // final location isn't one continuous place → warn
}

/**
 * Every decision of the count, row by row:
 *  - scanned known tire  → qty = units found, location = shelves it was found on
 *    (recorded elsewhere too: 'move' = all of it is here now, 'both' = keep both places, qty never drops)
 *  - expected but not found → qty 0 when `zeroMissing` has it, else untouched
 *  - unknown barcode → a new tire with that SKU
 */
export function buildReview(
  layout: StorageLayout,
  scope: string[],
  tires: ZoneTire[],
  entries: ZoneEntry[],
  outsideChoice: Record<string, OutsideChoice>,
  zeroMissing: Set<string>,
): ReviewRow[] {
  const inScope = new Set(scope)
  const byId = new Map(tires.map(t => [t.id, t]))
  const rows: ReviewRow[] = []

  for (const e of entries) {
    const counted = entryTotal(e)
    const found = entryShelves(e)
    const t = e.tireId ? byId.get(e.tireId) ?? null : null
    if (!t) {
      if (counted === 0) continue
      rows.push({ key: e.key, kind: 'new', label: e.label, sku: e.sku || null, tire: null, counted, systemQty: null,
        oldLocation: null, outside: [], newQty: counted, newLocation: formatLocation(found), split: isSplit(layout, found) })
      continue
    }
    const old = parseLocation(t.location)
    const outside = old.filter(s => !inScope.has(s))
    let qty = counted
    let loc = found.length ? found : old
    if (outside.length && outsideChoice[t.id] === 'both') {
      qty = Math.max(t.qty, counted)
      loc = sortShelves([...outside, ...found])
    }
    const newLocation = formatLocation(loc)
    rows.push({
      key: e.key, tire: t, label: tireLabel(t), sku: t.sku, counted, systemQty: t.qty,
      kind: outside.length && found.length ? 'moved' : qty !== t.qty ? 'diff' : 'ok',
      oldLocation: t.location, outside, newQty: qty, newLocation, split: isSplit(layout, loc),
    })
  }

  const counted = new Set(entries.map(e => e.tireId).filter(Boolean))
  for (const t of expectedTires(tires, scope)) {
    if (counted.has(t.id)) continue
    const zero = zeroMissing.has(t.id)
    rows.push({ key: 'id:' + t.id, kind: 'missing', label: tireLabel(t), sku: t.sku, tire: t, counted: 0, systemQty: t.qty,
      oldLocation: t.location, outside: [], newQty: zero ? 0 : t.qty, newLocation: t.location, split: false })
  }
  return rows
}

export function toSave(scope: string[], rows: ReviewRow[], notes: string): ZoneCountSave {
  return {
    shelves: scope,
    notes,
    updates: rows.filter(r => r.tire && (r.kind !== 'missing' || r.newQty !== r.systemQty)).map(r => ({
      tireId: r.tire!.id, qty: r.newQty, location: r.newLocation, counted: r.counted,
      systemQty: r.systemQty ?? 0, label: r.label, sku: r.sku,
    })),
    creates: rows.filter(r => r.kind === 'new').map(r => ({
      sku: r.sku, qty: r.newQty, location: r.newLocation, label: `${r.sku ?? r.label} (ממתין לפרטים)`,
    })),
  }
}
