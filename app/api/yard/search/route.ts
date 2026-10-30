import { NextRequest, NextResponse } from 'next/server'
import { getYardTenantId } from '@/lib/auth/yard-token'
import { createServiceClient } from '@/lib/supabase/service'
import { tireSizeText } from '@/lib/tires/size'
import { likePatterns } from '@/lib/search/fuzzy'
import { brandHe, brandMap, brandsMatchingHe } from '@/lib/tires/brands'

export interface SearchResult {
  id:         string
  type:       'tire' | 'product' | 'service'
  name:       string
  sku:        string | null
  price:      number
  stock:      number | null
  size?:      string   // tires only
  brand?:     string   // tires only
  location?:  string   // tires only — warehouse shelf location
  brand_en?:  string   // tires only — English brand when the name shows its Hebrew name
  dup_count?: number   // barcode lookup: how many records share this barcode (>1 = duplicates)
}

// GET /api/yard/search?q=TEXT&type=all|tire|product|service[&include_empty=1]
// include_empty=1 (price/stock lookup screen) also returns tires/products with no stock
export async function GET(req: NextRequest) {
  const tenantId = getYardTenantId()
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const profile = { tenant_id: tenantId }

  const q    = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const type = req.nextUrl.searchParams.get('type') ?? 'all'
  const includeEmpty = req.nextUrl.searchParams.get('include_empty') === '1'
  // Segmented tire size (TireSizeInput): filter by each part that was filled in
  const sizeParts = (['width', 'profile', 'rim'] as const)
    .map(k => [k, Number(req.nextUrl.searchParams.get(k))] as const)
    .filter(([, v]) => v > 0)

  const supabase = createServiceClient()
  const results: SearchResult[] = []

  // One spelling-tolerant pattern per word, all must match ("ספריי פנצר" finds "פנצ'ר ספרי")
  const patterns = likePatterns(q)

  // Tires
  if (type === 'all' || type === 'tire') {
    // Hebrew brand names (tire_brands): searchable, and shown instead of the English name
    const { data: brandRows } = await supabase.from('tire_brands').select('name_en, name_he').eq('tenant_id', profile.tenant_id)
    const brands = brandMap(brandRows)
    // brand / sku word: English as stored, or a Hebrew name of a brand
    const wordFilter = (w: string) => [
      `brand.ilike.${w}`, `sku.ilike.${w}`,
      ...brandsMatchingHe(brandRows, w.replace(/%/g, '')).map(en => `brand.ilike."${en.replace(/["\\]/g, '')}"`),
    ].join(',')

    let tireQuery = supabase
      .from('tires')
      .select('id, brand, width, profile, rim, speed_idx, load_idx, sell_price, qty, sku, location')
      .eq('tenant_id', profile.tenant_id)
    if (!includeEmpty) tireQuery = tireQuery.gt('qty', 0)

    if (sizeParts.length > 0) {
      for (const [col, v] of sizeParts) tireQuery = tireQuery.eq(col, v)
    } else if (q) {
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
      }
      // Words next to the size ("מישלן 205/55/16") narrow by brand; without a size they also match sku
      const words = nums.length ? likePatterns(q.replace(/[\d/\\.-]+/g, ' ').replace(/(^|\s)z?r(?=\s|$)/gi, ' ')) : patterns
      for (const w of words) tireQuery = tireQuery.or(wordFilter(w))
    }

    const { data: tires } = await tireQuery.order('brand').limit(40)

    for (const t of tires ?? []) {
      const size = tireSizeText(t, '/') || 'ללא מידה'
      const he = brandHe(brands, t.brand)
      results.push({
        id:    t.id,
        type:  'tire',
        name:  `${he ?? t.brand ?? ''} ${size} ${t.speed_idx ?? ''}${t.load_idx ?? ''}`.trim(),
        sku:   t.sku ?? null,
        price: t.sell_price ?? 0,
        stock: t.qty,
        size,
        brand: t.brand ?? undefined,
        location: t.location ?? undefined,
        ...(he && t.brand ? { brand_en: t.brand } : {}),
      })
    }
  }

  // Products
  if (type === 'all' || type === 'product') {
    let prodQuery = supabase
      .from('products')
      .select('id, name, sku, barcode, sell_price, qty')
      .eq('tenant_id', profile.tenant_id)
    if (!includeEmpty) prodQuery = prodQuery.gt('qty', 0)

    for (const w of patterns) {
      prodQuery = prodQuery.or(`name.ilike.${w},sku.ilike.${w},barcode.ilike.${w}`)
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
    let svcQuery = supabase
      .from('yard_services')
      .select('id, name, sku, price')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
    for (const w of patterns) svcQuery = svcQuery.ilike('name', w)
    const { data: services } = await svcQuery.order('sort_order').limit(20)

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
