'use client'

import { useRef } from 'react'

/**
 * Tells a barcode scanner apart from a person typing into a scan field. Scanners "type"
 * the whole code within a few ms per character; a person pauses longer. Scan fields
 * auto-search after a short pause only when the input came in scanner-fast — otherwise
 * a manually typed code would be looked up half-way ("72" of "7290000999").
 * Typed by hand → search on Enter / the "חפש" button.
 */
const SCANNER_GAP_MS = 60

export function useScanTyping() {
  const last = useRef(0)
  const slow = useRef(false)

  /** Call from the input's onChange with the new value. */
  function track(value: string) {
    const now = Date.now()
    if (value.length <= 1) slow.current = false          // new code started
    else if (now - last.current > SCANNER_GAP_MS) slow.current = true
    last.current = now
  }

  /** Scanner-speed input of a plausible code length (a single first character can't be judged yet) */
  return { track, isScanner: (value: string) => !slow.current && value.trim().length >= 4 }
}
