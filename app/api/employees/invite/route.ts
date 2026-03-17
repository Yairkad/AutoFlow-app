import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'

export async function POST(request: Request) {
  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const auth = await requireAuth([]) // admin / super_admin only
  if ('error' in auth) return auth.error

  const { profile } = auth
  if (!profile.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { tenant_id: profile.tenant_id },
    redirectTo: `${baseUrl}/auth/callback`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (invited?.user) {
    await admin.from('profiles').upsert({
      id: invited.user.id,
      tenant_id: profile.tenant_id,
      role: 'employee',
      allowed_modules: ['products_view', 'tires_view', 'my_profile'],
    })
  }

  return NextResponse.json({ ok: true })
}
