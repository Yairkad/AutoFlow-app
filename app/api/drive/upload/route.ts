import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, uploadFile, getOrCreateFolder } from '@/lib/drive'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file      = formData.get('file') as File | null
    const tenantId  = formData.get('tenant_id') as string | null
    const subFolder = formData.get('sub_folder') as string | null   // e.g. 'רכבים'
    const itemName  = formData.get('item_name')  as string | null   // e.g. plate number
    const directFolderId = formData.get('folder_id') as string | null  // direct folder ID (bypass sub_folder logic)

    if (!file || !tenantId) {
      return NextResponse.json({ error: 'Missing file or tenant_id' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Get tenant Drive credentials
    const { data: tenant } = await sb
      .from('tenants')
      .select('drive_refresh_token, drive_root_folder_id')
      .eq('id', tenantId)
      .single()

    if (!tenant?.drive_refresh_token) {
      return NextResponse.json({ error: 'Drive not connected' }, { status: 403 })
    }

    const accessToken = await getAccessToken(tenant.drive_refresh_token)
    let targetFolderId = directFolderId || tenant.drive_root_folder_id

    if (!directFolderId) {
      // Navigate to sub-folder (e.g. רכבים → plate)
      if (subFolder && targetFolderId) {
        targetFolderId = await getOrCreateFolder(accessToken, subFolder, targetFolderId)
      }
      if (itemName && targetFolderId) {
        targetFolderId = await getOrCreateFolder(accessToken, itemName, targetFolderId)
      }
    }

    // Upload
    const buffer   = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'application/octet-stream'
    const fileName = file.name || `file_${Date.now()}`

    const driveFile = await uploadFile(accessToken, buffer, mimeType, fileName, targetFolderId)

    return NextResponse.json({ id: driveFile.id, name: driveFile.name, webViewLink: driveFile.webViewLink })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Drive upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
