// Purchase-inspection price by license fee group (קבוצת רישוי).
// Prices live in price_list rows of the inspection category, one row per group range, named freely:
// "קבוצות 1-3", "קבוצה 4", "4,5", "6 ו-7", "7 ומעלה" / "7+". The numbers in the name say which groups it covers.

export interface InspectionPrice { service_name: string; price: number | null; price_note: string | null }

/** Is a price_list category the purchase-inspection one */
export const isInspectionCategory = (category: string) => /בדיק/.test(category)

/** Groups a price row covers, from its name. `from` = open-ended ("7+", "7 ומעלה"). */
export function groupsOf(name: string): { set: Set<number>; from: number | null } {
  const set = new Set<number>()
  let from: number | null = null
  let rest = name
  rest = rest.replace(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/g, (_, a, b) => {
    const lo = Math.min(+a, +b), hi = Math.max(+a, +b)
    for (let g = lo; g <= hi && g <= 20; g++) set.add(g)
    return ' '
  })
  rest = rest.replace(/(\d{1,2})\s*(\+|ומעלה|ומעל|and up)/g, (_, a) => { from = +a; return ' ' })
  for (const m of rest.matchAll(/\d{1,2}/g)) if (+m[0] >= 1 && +m[0] <= 20) set.add(+m[0])
  return { set, from }
}

/** The price row for a fee group, or null when no row names it */
export function priceForGroup<T extends InspectionPrice>(rows: T[], group: number | null | undefined): T | null {
  if (!group) return null
  return rows.find(r => { const g = groupsOf(r.service_name); return g.set.has(group) || (g.from != null && group >= g.from) }) ?? null
}
