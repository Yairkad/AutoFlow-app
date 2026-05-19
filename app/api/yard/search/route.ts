import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'

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
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }

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
      // Extract all digit groups — handles 195/55/16, 195/55R16, 195-55-16, etc.
      const nums = q.match(/\d+/g) ?? []
      if (nums.length >= 3) {
        tireQuery = tireQuery
          .eq('width',   Number(nums[0]))
          .eq('profile', Number(nums[1]))
          .eq('rim',     Number(nums[2]))
      } else if (nums.length === 2) {
        tireQuery = tireQuery
          .eq('width',   Number(nums[0]))
          .eq('profile', Number(nums[1]))
      } else if (nums.length === 1) {
        tireQuery = tireQuery.eq('width', Number(nums[0]))
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
