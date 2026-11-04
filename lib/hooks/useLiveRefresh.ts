'use client'

import { useEffect, useRef } from 'react'

export interface LiveRefreshOptions {
  /** Keep polling while the browser window is visible but not focused (another app on top, a
   *  second monitor). Only for wall/terminal screens nobody clicks — elsewhere it burns Vercel
   *  function time: every Supabase query goes through /api/store. */
  whenBlurred?: boolean
}

/**
 * Keeps a screen's data fresh with changes made on other devices, without Supabase
 * realtime (removed 2026-11-02 — it exhausted the DB's disk IO). Calls `reload` when the tab/app comes back into view, when the network
 * returns, and every `intervalMs` while the window is focused. Returns a cleanup function.
 */
export function startLiveRefresh(reload: () => unknown, intervalMs = 60_000, opts: LiveRefreshOptions = {}): () => void {
  let last = Date.now()
  const run = () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - last < 2_000) return   // focus + visibilitychange fire together
    last = Date.now()
    reload()
  }
  // A visible-but-unfocused window (manager working in another app all day) doesn't poll;
  // it catches up on the 'focus' event the moment they come back.
  const tick = () => { if (opts.whenBlurred || document.hasFocus()) run() }
  const id = setInterval(tick, intervalMs)
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
export function useLiveRefresh(reload: () => unknown, intervalMs = 60_000, opts: LiveRefreshOptions = {}) {
  const ref = useRef(reload)
  const whenBlurred = !!opts.whenBlurred
  useEffect(() => { ref.current = reload }, [reload])
  useEffect(() => startLiveRefresh(() => ref.current(), intervalMs, { whenBlurred }), [intervalMs, whenBlurred])
}
