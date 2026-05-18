import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require'
import { createClient } from '@/lib/supabase/server'

export interface SearchResult {
  id:         string
  type:       'tire' | 'product' | 'service'
  name:       string
  sku:        string | null
  price:      number
  stock:      number | null
  size?:      string   // tires only
  brand?:     string   // tires only
}

// GET /api/yard/search?q=TEXT&type=all|tire|product|service
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('error' in auth) return auth.error
  const { profile } = auth

  const q    = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const type = req.nextUrl.searchParams.get('type') ?? 'all'

  const supabase  = await createClient()
  const results: SearchResult[] = []

  const search = `%${q}%`

  // Tires
  if (type === 'all' || type === 'tire') {
    const { data: tires } = await supabase
      .from('tires')
      .select('id, brand, width, profile, rim, speed_index, load_index, sell_price, quantity, sku')
      .eq('tenant_id', profile.tenant_id)
      .gt('quantity', 0)
      .or(`brand.ilike.${search},sku.ilike.${search},width.ilike.${search}`)
      .order('brand')
      .limit(30)

    for (const t of tires ?? []) {
      const size = `${t.width}/${t.profile}/${t.rim}`
      results.push({
        id:    t.id,
        type:  'tire',
        name:  `${t.brand ?? ''} ${size} ${t.speed_index ?? ''}${t.load_index ?? ''}`.trim(),
        sku:   t.sku ?? null,
        price: t.sell_price ?? 0,
        stock: t.quantity,
        size,
        brand: t.brand ?? undefined,
      })
    }
  }

  // Products
  if (type === 'all' || type === 'product') {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku, sell_price, quantity')
      .eq('tenant_id', profile.tenant_id)
      .gt('quantity', 0)
      .or(`name.ilike.${search},sku.ilike.${search}`)
      .order('name')
      .limit(30)

    for (const p of products ?? []) {
      results.push({
        id:    p.id,
        type:  'product',
        name:  p.name,
        sku:   p.sku ?? null,
        price: p.sell_price ?? 0,
        stock: p.quantity,
      })
    }
  }

  // Services
  if (type === 'all' || type === 'service') {
    const { data: services } = await supabase
      .from('yard_services')
      .select('id, name, sku, price')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .ilike('name', search)
      .order('sort_order')
      .limit(20)

    for (const s of services ?? []) {
      results.push({
        id:    s.id,
        type:  'service',
        name:  s.name,
        sku:   s.sku ?? null,
        price: s.price ?? 0,
        stock: null,
      })
    }
  }

  return NextResponse.json(results)
}
