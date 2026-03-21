import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeCode, getAccessToken, setupRootFolders } from '@/lib/drive'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const tenantId = searchParams.get('state')   // we passed tenant_id as state
  const error    = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://auto-flow-app.vercel.app'

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

    // Get tenant name for root folder
    const { data: tenant } = await sb.from('tenants').select('name').eq('id', tenantId).single()
    const bizName = tenant?.name || 'AutoFlow'

    // Create Drive folder structure
    const rootFolderId = await setupRootFolders(access_token, bizName)

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
