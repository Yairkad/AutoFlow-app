// Google rating + the 5 newest reviews for the public home page.
// Needs GOOGLE_PLACES_API_KEY (server env) and the business Place ID (Settings → דף ציבורי).
// Refreshed once a day so every page view doesn't call Google. Any failure → null (section hidden).

export interface GoogleReview { author: string; rating: number; text: string; when: string; photo: string | null }
export interface GoogleReviews { rating: number | null; total: number | null; reviews: GoogleReview[] }

export function writeReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
}
export function allReviewsUrl(placeId: string) {
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`
}

const TTL_MS = 24 * 60 * 60 * 1000
// The home page is force-dynamic (which turns fetch caching off), so keep a per-instance memo too.
const memo = new Map<string, { at: number; data: GoogleReviews }>()

export async function fetchGoogleReviews(placeId: string): Promise<GoogleReviews | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !placeId) return null
  const hit = memo.get(placeId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data
  const data = await load(placeId, key)
  if (data) memo.set(placeId, { at: Date.now(), data })
  return data ?? hit?.data ?? null
}

async function load(placeId: string, key: string): Promise<GoogleReviews | null> {
  const url = 'https://maps.googleapis.com/maps/api/place/details/json'
    + `?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,reviews`
    + `&reviews_sort=newest&language=iw&key=${key}`
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 'OK') return null
    const r = json.result ?? {}
    return {
      rating: typeof r.rating === 'number' ? r.rating : null,
      total: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      reviews: (r.reviews ?? []).slice(0, 5).map((v: Record<string, unknown>) => ({
        author: String(v.author_name ?? ''),
        rating: Number(v.rating ?? 5),
        text: String(v.text ?? ''),
        when: String(v.relative_time_description ?? ''),
        photo: typeof v.profile_photo_url === 'string' ? v.profile_photo_url : null,
      })),
    }
  } catch {
    return null
  }
}
