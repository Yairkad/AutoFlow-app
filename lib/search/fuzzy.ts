// Spelling-tolerant Hebrew search. People type "ספריי" / "ספרי", "פנצ'ר" / "פנצ׳ר" / "פנצר" —
// all must find the same item. Every word is matched on its own, in any order.

const QUOTES = /['"`׳״‘’“”]/g
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }

/** Lowercase, drop quote/geresh marks, final letters → regular, doubled י/ו → single. */
export function normalizeSearch(s: string): string {
  return s.toLowerCase()
    .replace(QUOTES, '')
    .replace(/[ךםןףץ]/g, c => FINALS[c])
    .replace(/יי+/g, 'י')
    .replace(/וו+/g, 'ו')
    .replace(/[-_.,/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when every word of `query` appears somewhere in `haystack` (both normalized). */
export function fuzzyIncludes(haystack: string, query: string): boolean {
  const hay = normalizeSearch(haystack)
  return normalizeSearch(query).split(' ').filter(Boolean).every(w => hay.includes(w))
}

/**
 * ilike patterns for a DB search, one per word: '%ספרי%', '%פנצ%ר%'.
 * Quote marks become a wildcard and doubled י/ו collapse, so the DB matches either spelling.
 * Characters that break PostgREST or() syntax are dropped. AND the patterns together.
 */
export function likePatterns(query: string): string[] {
  return query.toLowerCase()
    .replace(/[,()*%_\\]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(QUOTES, '%').replace(/יי+/g, 'י').replace(/וו+/g, 'ו').replace(/%+/g, '%').replace(/^%|%$/g, ''))
    .filter(Boolean)
    .map(w => `%${w}%`)
}
