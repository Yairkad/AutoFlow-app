import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeCode, getAccessToken, setupRootFolders } from '@/lib/drive'
import { sessionTenant } from '@/lib/auth/sessionTenant'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  // state carries the tenant id from /api/drive/auth; it must match the admin who is signed in
  const guard = await sessionTenant(searchParams.get('state'), { adminOnly: true })
  if ('error' in guard) return guard.error
  const tenantId = guard.tenantId
  const error    = searchParams.get('error')

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://auto-flow-app.vercel.app').replace(/\/$/, '')

  if (error || !code || !tenantId) {
    return NextResponse.redirect(`${appUrl}/settings?drive=error`)
  }

  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Exchange code for tokens
    const { access_token, refresh_token } = await exchangeCode(code)

    // Get tenant name + existing root folder (if reconnecting)
    const { data: tenant } = await sb.from('tenants').select('name,drive_root_folder_id').eq('id', tenantId).single()
    const bizName = tenant?.name || 'AutoFlow'

    // Only create folder structure on first connect; reuse existing root on reconnect
    const rootFolderId = tenant?.drive_root_folder_id
      ? tenant.drive_root_folder_id
      : await setupRootFolders(access_token, bizName)

    // Save to DB
    await sb.from('tenants').update({
      drive_refresh_token:  refresh_token,
      drive_root_folder_id: rootFolderId,
    }).eq('id', tenantId)

    return NextResponse.redirect(`${appUrl}/settings?drive=connected`)
  } catch (err) {
    console.error('Drive callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?drive=error`)
  }
}
