import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'

// GET /api/yard/sessions?status=active|pending_office|all
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { profile } = auth

  const status = req.nextUrl.searchParams.get('status') ?? 'active'
  const supabase = await createClient()

  let query = supabase
    .from('yard_sessions')
    .select(`
      *,
      yard_session_items(id, item_type, name, sku, quantity, unit_price, price_modified, ref_id)
    `)
    .eq('tenant_id', profile.tenant_id)
    .order('opened_at', { ascending: true })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/yard/sessions — open new session
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { user, profile } = auth

  const body = await req.json()
  const { plate, make, model, year } = body

  if (!plate) return NextResponse.json({ error: 'plate required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('yard_sessions')
    .insert({
      tenant_id: profile.tenant_id,
      plate: plate.replace(/[-\s]/g, '').toUpperCase(),
      make:  make  ?? null,
      model: model ?? null,
      year:  year  ?? null,
      opened_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
