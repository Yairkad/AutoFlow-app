import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sessionTenant } from '@/lib/auth/sessionTenant'
import { getAccessToken } from '@/lib/drive'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const guard = await sessionTenant(searchParams.get('tenant_id'))
  if ('error' in guard) return NextResponse.json({ connected: false })
  const tenantId = guard.tenantId

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await sb
    .from('tenants')
    .select('drive_refresh_token, drive_root_folder_id')
    .eq('id', tenantId)
    .single()

  // ?verify=1 (settings screen): ask Google whether the saved permission still works — a saved
  // token alone said "connected" even after Google revoked it.
  let connected = !!data?.drive_refresh_token
  let expired = false
  if (connected && searchParams.get('verify') === '1') {
    try { await getAccessToken(data!.drive_refresh_token) }
    catch { connected = false; expired = true }
  }
  return NextResponse.json({
    connected,
    expired,
    rootFolderId: data?.drive_root_folder_id ?? null,
  })
}
