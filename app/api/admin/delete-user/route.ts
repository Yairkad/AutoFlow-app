import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'

export async function DELETE(request: Request) {
  const auth = await requireAuth([])
  if ('error' in auth) return auth.error

  const { profile } = auth
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify the user belongs to the same tenant before deleting
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .single()

  if (!targetProfile || targetProfile.tenant_id !== profile.tenant_id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
