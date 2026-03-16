import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

// DEV ONLY – auto-login without browser touching Supabase
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not available' }, { status: 403 })
  }

  const email    = process.env.DEV_EMAIL!
  const password = process.env.DEV_PASSWORD!

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  redirect('/dashboard')
}
