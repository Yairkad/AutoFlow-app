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

interface NewApiReview {
  rating?: number
  text?: { text?: string }
  originalText?: { text?: string }
  relativePublishTimeDescription?: string
  publishTime?: string
  authorAttribution?: { displayName?: string; photoUri?: string }
}

// Places API (New) — the legacy Place Details API is not offered to new Cloud projects.
// It returns up to 5 reviews chosen by Google (no "newest" sort), so they are ordered by date here.
async function load(placeId: string, key: string): Promise<GoogleReviews | null> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=iw`
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const r = await res.json() as { rating?: number; userRatingCount?: number; reviews?: NewApiReview[] }
    const reviews = [...(r.reviews ?? [])]
      .sort((a, b) => (b.publishTime ?? '').localeCompare(a.publishTime ?? ''))
      .slice(0, 5)
      .map(v => ({
        author: v.authorAttribution?.displayName ?? '',
        rating: Number(v.rating ?? 5),
        text: v.originalText?.text ?? v.text?.text ?? '',
        when: v.relativePublishTimeDescription ?? '',
        photo: v.authorAttribution?.photoUri ?? null,
      }))
      .filter(v => v.text)
    return {
      rating: typeof r.rating === 'number' ? r.rating : null,
      total: typeof r.userRatingCount === 'number' ? r.userRatingCount : null,
      reviews,
    }
  } catch {
    return null
  }
}
