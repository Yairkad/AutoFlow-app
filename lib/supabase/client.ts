import { createBrowserClient } from '@supabase/ssr'

// Direct to Supabase (eu-west-1). The old /api/store proxy added a Vercel hop + uncompressed
// responses to every query — it was the main cause of slow page loads.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
