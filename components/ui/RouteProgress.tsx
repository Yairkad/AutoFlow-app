'use client'

import NProgress from 'nprogress'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

NProgress.configure({ showSpinner: false, trickleSpeed: 200, minimum: 0.08 })

export default function RouteProgress() {
  const pathname = usePathname()
  const prevPath = useRef(pathname)

  // Complete bar when navigation finishes (pathname changed)
  useEffect(() => {
    if (prevPath.current !== pathname) {
      NProgress.done()
      prevPath.current = pathname
    }
  }, [pathname])

  // Start bar on any internal link click
  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || e.ctrlKey || e.metaKey) return
      NProgress.start()
    }
    document.addEventListener('click', onLinkClick)
    return () => document.removeEventListener('click', onLinkClick)
  }, [])

  return null
}

// Programmatic helpers — call these around manual load() calls
export function progressStart() { NProgress.start() }
export function progressDone()  { NProgress.done()  }
