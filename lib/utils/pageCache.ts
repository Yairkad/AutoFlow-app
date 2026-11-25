// In-memory cache of the data a page loaded, so coming back to it shows the last content at
// once while it refreshes in the background (stale-while-revalidate). Memory only: it lives as
// long as the tab does — a page refresh, closing the tab or signing out (full reload) clears it.
// Keys must include the tenant id.

const store = new Map<string, unknown>()

export const getPageCache = <T>(key: string): T | undefined => store.get(key) as T | undefined
export const setPageCache = <T>(key: string, data: T) => { store.set(key, data) }
export const clearPageCache = () => store.clear()
