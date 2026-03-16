import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Protected by ADMIN_SECRET header
export async function POST(request: Request) {
  const secret = request.headers.get('x-admin-secret')
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('registration_tokens')
    .insert({})
    .select('token')
    .single()

  if (error || !data) {
    console.error('generate-invite error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to generate token' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const link = `${baseUrl}/register?token=${data.token}`

  return NextResponse.json({ link, expires_in: '24 hours' })
}
