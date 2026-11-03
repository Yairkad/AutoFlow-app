'use client'

import { useEffect, useState } from 'react'
import type { AutocompleteOption } from '@/components/ui/AutocompleteInput'
import { brandSuggestions } from '@/lib/tires/brandSuggestions'

let cache: Promise<AutocompleteOption[]> | null = null

/** Existing tire brands as autocomplete options (fetched once per page load). */
export function useTireBrandSuggestions(): AutocompleteOption[] {
  const [opts, setOpts] = useState<AutocompleteOption[]>([])
  useEffect(() => {
    cache ??= fetch('/api/yard/tire-brands')
      .then(r => r.ok ? r.json() : { brands: [], he: [] })
      .then(d => brandSuggestions(d.brands ?? [], d.he ?? []))
      .catch(() => { cache = null; return [] })
    let alive = true
    cache.then(o => { if (alive) setOpts(o) })
    return () => { alive = false }
  }, [])
  return opts
}
