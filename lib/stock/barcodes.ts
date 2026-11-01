// Every barcode an item answers to: its main code(s) plus the extra ones (migration 110).
export function itemCodes(it: { sku?: string | null; barcode?: string | null; alt_barcodes?: string[] | null }): string[] {
  return [...new Set([it.sku, it.barcode, ...(it.alt_barcodes ?? [])].map(c => c?.trim()).filter((c): c is string => !!c))]
}

/** Codes to add as extra barcodes when `from` records merge into `into` (skips ones it already has). */
export function extraCodes(into: Parameters<typeof itemCodes>[0], from: Parameters<typeof itemCodes>[0][]): string[] {
  const have = new Set(itemCodes(into).map(c => c.toLowerCase()))
  const out: string[] = []
  for (const c of from.flatMap(itemCodes)) if (!have.has(c.toLowerCase())) { have.add(c.toLowerCase()); out.push(c) }
  return out
}
