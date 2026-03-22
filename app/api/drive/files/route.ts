import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, getOrCreateFolder, createFolder, listFiles, setupRootFolders } from '@/lib/drive'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId  = searchParams.get('tenant_id')
  const subFolder = searchParams.get('sub_folder')
  const folderId2 = searchParams.get('folder_id')

  if (!tenantId) return NextResponse.json({ files: [] })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: tenant } = await sb
    .from('tenants')
    .select('drive_refresh_token, drive_root_folder_id, name')
    .eq('id', tenantId)
    .single()

  if (!tenant?.drive_refresh_token || !tenant?.drive_root_folder_id) {
    return NextResponse.json({ files: [] })
  }

  const accessToken = await getAccessToken(tenant.drive_refresh_token)

  async function resolveFolderId(rootId: string): Promise<string> {
    if (folderId2) return folderId2
    if (subFolder)  return getOrCreateFolder(accessToken, subFolder, rootId)
    return rootId
  }

  try {
    const folderId = await resolveFolderId(tenant.drive_root_folder_id)
    const files    = await listFiles(accessToken, folderId)
    return NextResponse.json({ files, folderId })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('404') || msg.includes('notFound')) {
      // Root folder deleted — recreate automatically
      console.warn('Drive root folder missing, recreating...')
      try {
        const newRootId = await setupRootFolders(accessToken, tenant.name || 'AutoFlow')
        await sb.from('tenants').update({ drive_root_folder_id: newRootId }).eq('id', tenantId)
        const folderId = await resolveFolderId(newRootId)
        const files    = await listFiles(accessToken, folderId)
        return NextResponse.json({ files, folderId, rebuilt: true })
      } catch (e2) {
        console.error('Drive rebuild failed:', e2)
        return NextResponse.json({ files: [], error: 'rebuild_failed' })
      }
    }
    console.error('Drive files error:', err)
    return NextResponse.json({ files: [], error: 'unknown' })
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
    try {
      const id = await createFolder(accessToken, name, parent_id)
      return NextResponse.json({ id, name })
    } catch (err) {
      const msg = String(err)
      if (msg.includes('404') || msg.includes('notFound')) {
        // parent folder gone — rebuild root and retry under מסמכים
        const { data: t2 } = await sb.from('tenants').select('name').eq('id', tenant_id).single()
        const newRootId = await setupRootFolders(accessToken, t2?.name || 'AutoFlow')
        await sb.from('tenants').update({ drive_root_folder_id: newRootId }).eq('id', tenant_id)
        const docsId = await getOrCreateFolder(accessToken, 'מסמכים', newRootId)
        const id = await createFolder(accessToken, name, docsId)
        return NextResponse.json({ id, name, rebuilt: true })
      }
      throw err
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
