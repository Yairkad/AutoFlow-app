import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, deleteFile } from '@/lib/drive'

export async function DELETE(req: Request) {
  try {
    const { tenant_id, file_id } = await req.json()
    if (!tenant_id || !file_id) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: tenant } = await sb
      .from('tenants')
      .select('drive_refresh_token')
      .eq('id', tenant_id)
      .single()

    if (!tenant?.drive_refresh_token) {
      return NextResponse.json({ error: 'Drive not connected' }, { status: 403 })
    }

    const accessToken = await getAccessToken(tenant.drive_refresh_token)
    await deleteFile(accessToken, file_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Drive delete error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
