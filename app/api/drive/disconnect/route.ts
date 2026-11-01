import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sessionTenant } from '@/lib/auth/sessionTenant'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const guard = await sessionTenant(body.tenant_id, { adminOnly: true })
    if ('error' in guard) return guard.error
    const tenant_id = guard.tenantId

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await sb.from('tenants')
      .update({ drive_refresh_token: null, drive_root_folder_id: null })
      .eq('id', tenant_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
