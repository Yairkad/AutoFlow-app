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
    let tireQuery = supabase
      .from('tires')
      .select('id, brand, width, profile, rim, speed_idx, load_idx, sell_price, qty, sku')
      .eq('tenant_id', profile.tenant_id)
      .gt('qty', 0)

    if (q) {
      // Try to parse as size: 195/55/16 or 195 55 16
      const sizeParts = q.match(/^(\d+)[\/\s\-](\d+)[\/\s\-](\d+)$/)
      const singleNum = q.match(/^(\d+)$/)
      if (sizeParts) {
        tireQuery = tireQuery
          .eq('width', Number(sizeParts[1]))
          .eq('profile', Number(sizeParts[2]))
          .eq('rim', Number(sizeParts[3]))
      } else if (singleNum) {
        tireQuery = tireQuery.eq('width', Number(singleNum[1]))
      } else {
        tireQuery = tireQuery.or(`brand.ilike.${search},sku.ilike.${search}`)
      }
    }

    const { data: tires } = await tireQuery.order('brand').limit(40)

    for (const t of tires ?? []) {
      const size = `${t.width}/${t.profile}/${t.rim}`
      results.push({
        id:    t.id,
        type:  'tire',
        name:  `${t.brand ?? ''} ${size} ${t.speed_idx ?? ''}${t.load_idx ?? ''}`.trim(),
        sku:   t.sku ?? null,
        price: t.sell_price ?? 0,
        stock: t.qty,
        size,
        brand: t.brand ?? undefined,
      })
    }
  }

  // Products
  if (type === 'all' || type === 'product') {
    let prodQuery = supabase
      .from('products')
      .select('id, name, sku, sell_price, qty')
      .eq('tenant_id', profile.tenant_id)
      .gt('qty', 0)

    if (q) {
      prodQuery = prodQuery.or(`name.ilike.${search},sku.ilike.${search}`)
    }

    const { data: products } = await prodQuery.order('name').limit(30)

    for (const p of products ?? []) {
      results.push({
        id:    p.id,
        type:  'product',
        name:  p.name,
        sku:   p.sku ?? null,
        price: p.sell_price ?? 0,
        stock: p.qty,
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
