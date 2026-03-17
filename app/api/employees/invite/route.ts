import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email, employeeId } = await request.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const supabase = await createServerClient()

  // Get current user's tenant_id
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create employee invite token
  const { data: token, error } = await admin
    .from('registration_tokens')
    .insert({ email, type: 'employee', tenant_id: profile.tenant_id })
    .select('token')
    .single()

  if (error || !token) return NextResponse.json({ error: error?.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const link = `${baseUrl}/register?token=${token.token}&type=employee`

  return NextResponse.json({ link })
}
