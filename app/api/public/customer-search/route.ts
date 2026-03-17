import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public route – no auth cookie needed.
// Uses anon key; RLS policy "public_track_read" on alignment_jobs allows this.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: NextRequest) {
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
    .select('track_token, customer_phone, status')
    .eq('plate', plate)
    .not('track_token', 'is', null)
    .in('status', ['ממתין', 'בעבודה'])   // only open jobs
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('[customer-search] supabase error:', error.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ found: false })
  }

  // Verify last-4 phone digits (client-side verification done here server-side for security)
  const match = jobs.find(
    (j) => j.customer_phone && j.customer_phone.replace(/\D/g, '').endsWith(phone4),
  )

  if (!match) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({ found: true, token: match.track_token })
}
