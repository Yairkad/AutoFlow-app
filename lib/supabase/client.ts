import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const PROXY_URL    = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000') + '/api/store'

// Custom fetch: hides the real Supabase path inside an x-target header
// so Netfree never sees supabase.co or auth/v1/token in the URL.
function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url

  if (url.startsWith(SUPABASE_URL)) {
    const pathAndQuery = url.slice(SUPABASE_URL.length) // e.g. /rest/v1/products
    const encoded = btoa(unescape(encodeURIComponent(pathAndQuery)))
    return fetch(`${PROXY_URL}?p=${encoded}`, { ...init })
  }

  return fetch(input, init)
}

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    process.env.NODE_ENV === 'development' ? { global: { fetch: proxyFetch } } : {}
  )
}
