'use client'

import { useEffect, useRef } from 'react'

export interface SearchLink { open: string | null; q: string | null; month: string | null }

/**
 * Deep link from the global search: ?open=<id>&q=<text>&month=YYYY-MM.
 * `apply` runs once after mount (never during SSR/hydration) with whatever params are present;
 * q/month are then dropped from the URL so a refresh doesn't re-apply them.
 */
export function useSearchLink(apply: (link: SearchLink) => void) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const url = new URL(window.location.href)
    const p = url.searchParams
    const link = { open: p.get('open'), q: p.get('q'), month: p.get('month') }
    if (!link.open && !link.q && !link.month) return
    apply(link)
    if (link.q || link.month) {
      p.delete('q'); p.delete('month') // `open` stays for pages that read it themselves (contacts / accounts)
      window.history.replaceState(null, '', url)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once, on mount
}
