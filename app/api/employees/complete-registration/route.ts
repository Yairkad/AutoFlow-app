import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId, token } = await request.json()
  if (!userId || !token) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get token data
  const { data: tokenData } = await admin
    .from('registration_tokens')
    .select('tenant_id, type, used')
    .eq('token', token)
    .single()

  if (!tokenData || tokenData.used || tokenData.type !== 'employee') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Link user to tenant
  await admin
    .from('profiles')
    .update({ tenant_id: tokenData.tenant_id })
    .eq('id', userId)

  // Burn token
  await admin
    .from('registration_tokens')
    .update({ used: true })
    .eq('token', token)

  return NextResponse.json({ ok: true })
}
