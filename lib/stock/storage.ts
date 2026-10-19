// Tire storage map: cabinets (A, B, …) with shelves numbered from the top (A1 = cabinet A, top shelf).
// Cabinets stand in rows. In a "contiguous" row a shelf continues into the next cabinet
// (B3 and C3 are one long shelf), so a tire on B3 + C3 is still "in one place".

export interface StorageCabinet { code: string; shelves: number }

export interface StorageRow {
  id: string
  name: string
  x: number            // grid position (cabinet widths) on the map
  y: number            // grid position (rows of the map)
  dir: 'h' | 'v'       // cabinets side by side, or one under the other
  contiguous: boolean  // shelves continue between neighbouring cabinets
  cabinets: StorageCabinet[]
}

export interface StorageLayout { rows: StorageRow[] }

// First guess from the user's description — edited on /tires/storage to match the real room
export const DEFAULT_LAYOUT: StorageLayout = {
  rows: [
    { id: 'r1', name: 'קיר ראשי', x: 0, y: 0, dir: 'h', contiguous: true,
      cabinets: ['A', 'B', 'C', 'D', 'E', 'F'].map(code => ({ code, shelves: 5 })) },
    { id: 'r2', name: 'נמוכים', x: 0, y: 1, dir: 'h', contiguous: false,
      cabinets: ['G', 'H'].map(code => ({ code, shelves: 3 })) },
    { id: 'r3', name: 'מקבילים', x: 3, y: 1, dir: 'h', contiguous: true,
      cabinets: ['I', 'J'].map(code => ({ code, shelves: 5 })) },
    { id: 'r4', name: 'נפרד', x: 6, y: 1, dir: 'h', contiguous: false,
      cabinets: [{ code: 'K', shelves: 5 }] },
  ],
}

/** "a3, B2 / c10" → ['A3', 'B2', 'C10'] (unique, in order). Free text that isn't a shelf is ignored. */
export function parseLocation(text: string | null | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const m of text.matchAll(/([A-Za-z])\s*-?\s*(\d{1,2})/g)) {
    const s = m[1].toUpperCase() + Number(m[2])
    if (!out.includes(s)) out.push(s)
  }
  return out
}

export function formatLocation(shelves: string[]): string | null {
  return shelves.length ? sortShelves(shelves).join(', ') : null
}

export function sortShelves(shelves: string[]): string[] {
  return [...new Set(shelves)].sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)))
}

export function cabinetOf(shelf: string): string { return shelf[0] }
export function shelfNo(shelf: string): number { return Number(shelf.slice(1)) }

export function findCabinet(layout: StorageLayout, code: string): { row: StorageRow; cab: StorageCabinet } | null {
  for (const row of layout.rows) {
    const cab = row.cabinets.find(c => c.code === code)
    if (cab) return { row, cab }
  }
  return null
}

export function shelvesOfCabinet(cab: StorageCabinet): string[] {
  return Array.from({ length: cab.shelves }, (_, i) => `${cab.code}${i + 1}`)
}

export function allShelves(layout: StorageLayout): string[] {
  return layout.rows.flatMap(r => r.cabinets.flatMap(shelvesOfCabinet))
}

export function isKnownShelf(layout: StorageLayout, shelf: string): boolean {
  const f = findCabinet(layout, cabinetOf(shelf))
  return !!f && shelfNo(shelf) >= 1 && shelfNo(shelf) <= f.cab.shelves
}

/** One physical place: a contiguous row's shelf level, or a single shelf. */
export function zoneOf(layout: StorageLayout, shelf: string): string {
  const f = findCabinet(layout, cabinetOf(shelf))
  return f?.row.contiguous ? `${f.row.id}:${shelfNo(shelf)}` : shelf
}

/** Shelves that aren't one continuous place (e.g. A2 + C6) — the user wants a warning for these. */
export function isSplit(layout: StorageLayout, shelves: string[]): boolean {
  return new Set(shelves.map(s => zoneOf(layout, s))).size > 1
}

export function cabinetCodes(layout: StorageLayout): string[] {
  return layout.rows.flatMap(r => r.cabinets.map(c => c.code))
}

/** Basic sanity for a saved layout: unique single-letter codes, 1–20 shelves. Returns an error or null. */
export function validateLayout(layout: StorageLayout): string | null {
  if (!layout || !Array.isArray(layout.rows)) return 'תרשים לא תקין'
  const seen = new Set<string>()
  for (const r of layout.rows) {
    for (const c of r.cabinets) {
      if (!/^[A-Z]$/.test(c.code)) return `קוד ארון "${c.code}" — אות אנגלית אחת`
      if (seen.has(c.code)) return `הארון ${c.code} מופיע פעמיים`
      seen.add(c.code)
      if (!Number.isInteger(c.shelves) || c.shelves < 1 || c.shelves > 20) return `מספר מדפים בארון ${c.code}: 1–20`
    }
  }
  return null
}

/** Cabinet → last time any of its shelves was counted (a full count covers every cabinet). */
export function lastCountByCabinet(
  layout: StorageLayout,
  sessions: { counted_at: string; zone: string[] | null }[],
): Record<string, string> {
  const out: Record<string, string> = {}
  const codes = cabinetCodes(layout)
  for (const s of sessions) {
    const cabs = s.zone ? [...new Set(s.zone.map(cabinetOf))] : codes
    for (const c of cabs) if (!out[c] || out[c] < s.counted_at) out[c] = s.counted_at
  }
  return out
}

/** Freshness colour for a count date: green ≤ 30 days, amber ≤ 90, red older / never. */
export function countFreshness(iso: string | undefined): { color: string; bg: string; days: number | null } {
  if (!iso) return { color: '#b91c1c', bg: '#fee2e2', days: null }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 30) return { color: '#15803d', bg: '#dcfce7', days }
  if (days <= 90) return { color: '#b45309', bg: '#fef3c7', days }
  return { color: '#b91c1c', bg: '#fee2e2', days }
}
