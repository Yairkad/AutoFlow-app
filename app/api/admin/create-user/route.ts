import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'

export async function POST(request: Request) {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error

  const { profile } = auth
  if (!profile.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { email, password, full_name, phone, role, allowed_modules } = await request.json()
  if (!email || !password) return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('profiles').upsert({
    id: created.user.id,
    tenant_id: profile.tenant_id,
    full_name: full_name || null,
    phone: phone || null,
    role: role || 'employee',
    allowed_modules: allowed_modules ?? [],
    is_active: true,
  })

  return NextResponse.json({ ok: true })
}
