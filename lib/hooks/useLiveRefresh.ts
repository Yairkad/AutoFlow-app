'use client'

import { useEffect, useRef } from 'react'

/**
 * Keeps a screen's data fresh with changes made on other devices, without relying on
 * Supabase realtime (a websocket straight to supabase.co that Netfree / mobile data
 * often block). Calls `reload` when the tab/app comes back into view, when the network
 * returns, and every `intervalMs` while visible. Returns a cleanup function.
 */
export function startLiveRefresh(reload: () => unknown, intervalMs = 20_000): () => void {
  let last = Date.now()
  const run = () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - last < 2_000) return   // focus + visibilitychange fire together
    last = Date.now()
    reload()
  }
  const id = setInterval(run, intervalMs)
  document.addEventListener('visibilitychange', run)
  window.addEventListener('focus', run)
  window.addEventListener('online', run)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', run)
    window.removeEventListener('focus', run)
    window.removeEventListener('online', run)
  }
}

/** Hook form of startLiveRefresh; always calls the latest `reload`. */
export function useLiveRefresh(reload: () => unknown, intervalMs = 20_000) {
  const ref = useRef(reload)
  useEffect(() => { ref.current = reload }, [reload])
  useEffect(() => startLiveRefresh(() => ref.current(), intervalMs), [intervalMs])
}
