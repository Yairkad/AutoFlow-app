import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, getOrCreateFolder, listFiles } from '@/lib/drive'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  const subFolder = searchParams.get('sub_folder')

  if (!tenantId) return NextResponse.json({ files: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: tenant } = await sb
    .from('tenants')
    .select('drive_refresh_token, drive_root_folder_id')
    .eq('id', tenantId)
    .single()

  if (!tenant?.drive_refresh_token || !tenant?.drive_root_folder_id) {
    return NextResponse.json({ files: [] })
  }

  try {
    const accessToken = await getAccessToken(tenant.drive_refresh_token)
    let folderId = tenant.drive_root_folder_id

    if (subFolder) {
      folderId = await getOrCreateFolder(accessToken, subFolder, folderId)
    }

    const files = await listFiles(accessToken, folderId)
    return NextResponse.json({ files })
  } catch (err) {
    console.error('Drive files error:', err)
    return NextResponse.json({ files: [] })
  }
}
