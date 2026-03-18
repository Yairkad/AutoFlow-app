import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public route – no auth cookie needed.
// Uses anon key; RLS policy "public_track_read" on alignment_jobs allows this.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Simple in-memory rate limiter ──────────────────────────────────────────
// Max 10 requests per IP per minute. Resets per serverless instance.
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000
const ipHits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  if (entry.count >= RATE_LIMIT) return true
  entry.count++
  return false
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const plate: string = (body.plate ?? '').trim().toUpperCase()
  const phone4: string = (body.phone4 ?? '').trim()

  if (!plate || !phone4 || phone4.length !== 4 || !/^\d{4}$/.test(phone4)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  // Fetch jobs matching the plate (public_track_read policy requires track_token to be set)
  const { data: jobs, error } = await supabase
    .from('alignment_jobs')
    .select('customer_phone, plate, make, model, year, color, job_type, status, updated_at')
    .eq('plate', plate)
    .not('track_token', 'is', null)
    .not('status', 'eq', 'delivered')   // any active job (not closed)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('[customer-search] supabase error:', error.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ found: false })
  }

  // Verify last-4 phone digits server-side for security
  const match = jobs.find(
    (j) => j.customer_phone && j.customer_phone.replace(/\D/g, '').endsWith(phone4),
  )

  if (!match) {
    return NextResponse.json({ found: false })
  }

  const { customer_phone: _ph, ...jobData } = match
  return NextResponse.json({ found: true, job: jobData })
}
