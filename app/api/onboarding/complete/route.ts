import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // Get current user from session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, subTitle, phone, address, taxId, logo } = body

  // Use service role to bypass RLS
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create tenant
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .insert({ name, sub_title: subTitle, phone, address, tax_id: taxId, logo_base64: logo })
    .select('id')
    .single()

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: tenantErr?.message || 'Failed to create tenant' }, { status: 500 })
  }

  // Create profile (upsert in case of retry)
  const fullName = user.user_metadata?.full_name || user.email
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: user.id, tenant_id: tenant.id, full_name: fullName, role: 'admin' })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
