import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'yard-onscreen-keyboard'
const CHANGE_EVENT = 'yard-onscreen-keyboard-change'

function readPref(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

/**
 * Shared, localStorage-backed preference for whether the yard terminal's
 * custom on-screen keyboards/numpads should appear (tablet use) or stay
 * hidden so only a physical/external keyboard drives input (desktop use).
 * Defaults to enabled (unchanged tablet behavior) until a device explicitly
 * turns it off via KeyboardModeToggle. A same-tab CustomEvent keeps every
 * component instance in sync — the `storage` event alone only fires across
 * tabs, never within the tab that made the change.
 */
export function useOnScreenKeyboardPref() {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    setEnabledState(readPref())
    const onChange = () => setEnabledState(readPref())
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const setEnabled = useCallback((v: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return { enabled, setEnabled }
}
