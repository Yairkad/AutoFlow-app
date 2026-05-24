import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, mergeRootFolders } from '@/lib/drive'

export async function POST(req: Request) {
  try {
    const { tenant_id } = await req.json()
    if (!tenant_id) return NextResponse.json({ error: 'missing tenant_id' }, { status: 400 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: tenant } = await sb
      .from('tenants')
      .select('name,drive_refresh_token,drive_root_folder_id')
      .eq('id', tenant_id)
      .single()

    if (!tenant?.drive_refresh_token) return NextResponse.json({ error: 'not connected' }, { status: 400 })
    if (!tenant?.drive_root_folder_id) return NextResponse.json({ error: 'no root folder' }, { status: 400 })

    const accessToken = await getAccessToken(tenant.drive_refresh_token)
    const result = await mergeRootFolders(accessToken, tenant.name, tenant.drive_root_folder_id)

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('Drive merge error:', err)
    return NextResponse.json({ error: 'merge failed' }, { status: 500 })
  }
}
