import type { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_LAYOUT, formatLocation, isKnownShelf, parseLocation, type StorageLayout } from './storage'

type Sb = ReturnType<typeof createServiceClient>

/** The tenant's storage map, or the default guess until someone saves one. */
export async function loadLayout(sb: Sb, tenantId: string): Promise<{ layout: StorageLayout; saved: boolean }> {
  const { data } = await sb.from('storage_maps').select('layout').eq('tenant_id', tenantId).maybeSingle()
  return data?.layout ? { layout: data.layout as StorageLayout, saved: true } : { layout: DEFAULT_LAYOUT, saved: false }
}

export interface LocationSuggestion { location: string; reason: 'existing' | 'similar' }

/**
 * Where to put a tire that just arrived: where this tire already sits, else the shelf most used
 * for the same size (then same width + rim, then same rim). Only shelves that are on the map.
 */
export async function suggestLocation(
  sb: Sb, tenantId: string,
  t: { id: string; location?: string | null; width: number | null; profile: number | null; rim: number | null },
): Promise<LocationSuggestion | null> {
  const { layout } = await loadLayout(sb, tenantId)
  const own = parseLocation(t.location).filter(s => isKnownShelf(layout, s))
  if (own.length) return { location: formatLocation(own)!, reason: 'existing' }
  if (!t.rim) return null

  const { data } = await sb.from('tires').select('width, profile, rim, location')
    .eq('tenant_id', tenantId).eq('rim', t.rim).gt('qty', 0).not('location', 'is', null).neq('id', t.id).limit(1000)
  const tiers = [
    (x: { width: number | null; profile: number | null }) => x.width === t.width && x.profile === t.profile,
    (x: { width: number | null }) => x.width === t.width,
    () => true,
  ]
  for (const match of tiers) {
    const votes = new Map<string, number>()
    for (const x of (data ?? []).filter(match)) {
      for (const s of parseLocation(x.location)) if (isKnownShelf(layout, s)) votes.set(s, (votes.get(s) ?? 0) + 1)
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) return { location: best[0], reason: 'similar' }
  }
  return null
}
