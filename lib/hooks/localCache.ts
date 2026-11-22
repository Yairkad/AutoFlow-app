// Last-known data kept in localStorage so a panel shows instantly on open and refreshes behind
// the scenes (stale-while-revalidate). Only for small, rarely-changing lists (yard drawer).
const PREFIX = 'af-cache:'

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

export function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* quota / private mode */ }
}
