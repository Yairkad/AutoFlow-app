import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { tenant_id } = await req.json()
    if (!tenant_id) return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 })

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
