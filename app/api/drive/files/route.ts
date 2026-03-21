import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, getOrCreateFolder, createFolder, listFiles } from '@/lib/drive'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId  = searchParams.get('tenant_id')
  const subFolder = searchParams.get('sub_folder')   // folder name under root
  const folderId2 = searchParams.get('folder_id')    // direct folder id

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

    if (folderId2) {
      folderId = folderId2
    } else if (subFolder) {
      folderId = await getOrCreateFolder(accessToken, subFolder, folderId)
    }

    const files = await listFiles(accessToken, folderId)
    return NextResponse.json({ files, folderId })
  } catch (err) {
    console.error('Drive files error:', err)
    return NextResponse.json({ files: [] })
  }
}

// POST – create a new subfolder
export async function POST(req: Request) {
  try {
    const { tenant_id, parent_id, name } = await req.json()
    if (!tenant_id || !parent_id || !name) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: tenant } = await sb
      .from('tenants').select('drive_refresh_token').eq('id', tenant_id).single()
    if (!tenant?.drive_refresh_token) {
      return NextResponse.json({ error: 'Not connected' }, { status: 403 })
    }
    const accessToken = await getAccessToken(tenant.drive_refresh_token)
    const id = await createFolder(accessToken, name, parent_id)
    return NextResponse.json({ id, name })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
