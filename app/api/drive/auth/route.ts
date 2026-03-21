import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOAuthUrl } from '@/lib/drive'

export async function GET(req: Request) {
  // Get tenant_id from session
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 })

  // Verify tenant exists
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await sb.from('tenants').select('id').eq('id', tenantId).single()
  if (!data) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const url = getOAuthUrl(tenantId)
  return NextResponse.redirect(url)
}
