// Tires can be saved before their details are known (unknown barcode in a scan, quick manual
// receive) — width/profile/rim are then null until someone fills them in from the tires page.

type SizeFields = { width: number | null; profile: number | null; rim: number | null }

export function hasTireSize(t: SizeFields): boolean {
  return !!(t.width && t.profile && t.rim)
}

/** "205/55R16", or '' when the size wasn't entered yet. */
export function tireSizeText(t: SizeFields, sep: 'R' | '/' = 'R'): string {
  return hasTireSize(t) ? `${t.width}/${t.profile}${sep}${t.rim}` : ''
}

/** Missing size or brand — shown under the "חסרי נתונים" filter. */
export function isTireMissingDetails(t: SizeFields & { brand: string | null }): boolean {
  return !hasTireSize(t) || !t.brand?.trim()
}

export function isTireMissingPrice(t: { sell_price: number | null }): boolean {
  return !t.sell_price
}

/** Parses free text like "205/55R16", "205 55 16", "205/55/16". */
export function parseTireSize(text: string): { width: number; profile: number; rim: number } | null {
  const m = text.match(/(\d{3})\s*[\/\s-]\s*(\d{2})\s*(?:z?r|\/|\s|-)?\s*(\d{2})/i)
  if (!m) return null
  return { width: Number(m[1]), profile: Number(m[2]), rim: Number(m[3]) }
}

/**
 * Search text for a tire size typed on a phone number pad, where "/" and "R" aren't
 * available: "2055516" → "205/55/16", "20555" → "205/55". Anything else is returned as is.
 */
export function tireQueryFromDigits(text: string): string {
  const t = text.trim()
  if (!/^\d{3,7}$/.test(t)) return t
  return [t.slice(0, 3), t.slice(3, 5), t.slice(5, 7)].filter(Boolean).join('/')
}
