import type { AutocompleteOption } from '@/components/ui/AutocompleteInput'
import { brandMap, brandHe, keyOf, type BrandName } from './brands'

/**
 * Autocomplete options for a tire brand field: one per brand (most used spelling of it, most used brand first),
 * with its Hebrew name as a hint so typing "מישלן" suggests "Michelin".
 */
export function brandSuggestions(brands: (string | null | undefined)[], heRows?: BrandName[] | null): AutocompleteOption[] {
  // key → spelling → count
  const byKey = new Map<string, Map<string, number>>()
  for (const raw of brands) {
    const b = raw?.trim()
    if (!b) continue
    const k = keyOf(b)
    const sp = byKey.get(k) ?? new Map<string, number>()
    sp.set(b, (sp.get(b) ?? 0) + 1)
    byKey.set(k, sp)
  }
  const map = brandMap(heRows)
  const out = [...byKey.values()].map(sp => {
    const [best] = [...sp.entries()].sort((a, b) => b[1] - a[1])
    const total = [...sp.values()].reduce((s, n) => s + n, 0)
    return { value: best[0], hint: brandHe(map, best[0]) ?? undefined, n: total }
  })
  // Brands named in tire_brands but with no tire yet
  for (const r of heRows ?? []) {
    if (r.name_en?.trim() && !byKey.has(keyOf(r.name_en))) out.push({ value: r.name_en.trim(), hint: r.name_he?.trim() || undefined, n: 0 })
  }
  return out.sort((a, b) => b.n - a.n || a.value.localeCompare(b.value)).map(({ value, hint }) => ({ value, hint }))
}
