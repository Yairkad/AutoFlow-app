import { fuzzyIncludes, normalizeSearch } from '@/lib/search/fuzzy'

// Hebrew names for tire brands (table tire_brands): one name per brand, applied to all its tires.

export interface BrandName { name_en: string; name_he: string }

const keyOf = (brand: string | null | undefined) => normalizeSearch(brand ?? '').replace(/\s+/g, '')

/** brand key → Hebrew name */
export type BrandMap = Map<string, string>

export function brandMap(rows: BrandName[] | null | undefined): BrandMap {
  return new Map((rows ?? []).filter(r => r.name_he?.trim()).map(r => [keyOf(r.name_en), r.name_he.trim()]))
}

/** Hebrew name of a brand, or null when none was set */
export function brandHe(map: BrandMap, brand: string | null | undefined): string | null {
  return brand ? map.get(keyOf(brand)) ?? null : null
}

/** Text to search a tire's brand by — English and Hebrew together */
export function brandSearchText(map: BrandMap, brand: string | null | undefined): string {
  return [brand, brandHe(map, brand)].filter(Boolean).join(' ')
}

/** English brand names whose Hebrew name matches a typed word ("מישלן" → ["Michelin"]) */
export function brandsMatchingHe(rows: BrandName[] | null | undefined, word: string): string[] {
  return (rows ?? []).filter(r => r.name_he && fuzzyIncludes(r.name_he, word)).map(r => r.name_en)
}

/** Same brand, typed in either language ("מישלן" ~ "Michelin") */
export function sameBrand(map: BrandMap, a: string | null | undefined, b: string | null | undefined): boolean {
  const names = (x: string | null | undefined) => [keyOf(x), keyOf(brandHe(map, x))].filter(Boolean)
  const he = (x: string | null | undefined) => [...map.entries()].filter(([, v]) => keyOf(v) === keyOf(x)).map(([k]) => k)
  const A = new Set([...names(a), ...he(a)]), B = [...names(b), ...he(b)]
  return B.some(k => A.has(k)) || (!keyOf(a) && !keyOf(b))
}
