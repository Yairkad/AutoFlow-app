import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, email, password, fullName } = await request.json()
  if (!token || !email || !password) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Validate token
  const { data: tokenData } = await admin
    .from('registration_tokens')
    .select('tenant_id, used, expires_at, default_modules')
    .eq('token', token)
    .single()

  if (!tokenData || tokenData.used) {
    return NextResponse.json({ error: 'קישור לא תקין או כבר נוצל' }, { status: 400 })
  }
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: 'קישור פג תוקף' }, { status: 400 })
  }

  // Create user via admin API – no confirmation email, no rate limit
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'שגיאה ביצירת משתמש' }, { status: 400 })
  }

  const defaultMods: string[] = tokenData.default_modules?.length
    ? tokenData.default_modules
    : ['products_view', 'tires_view', 'my_profile']

  // Link to tenant
  await admin.from('profiles').upsert({
    id:              created.user.id,
    tenant_id:       tokenData.tenant_id,
    role:            'employee',
    full_name:       fullName || null,
    allowed_modules: defaultMods,
    is_active:       true,
  })

  // Burn token
  await admin.from('registration_tokens').update({ used: true }).eq('token', token)

  return NextResponse.json({ ok: true })
}
