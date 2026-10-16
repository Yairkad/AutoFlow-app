import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/service'
import { logoPalette } from '@/lib/og/logoColors'
import { resolveGuide, type GuideContent } from '@/lib/guide/content'
import type { GuideBusiness } from '@/components/guide/GuideView'

// Loads a garage's public tire guide — by its QR token (/guide/<token>) or, for the
// site's own business, by tenant id (/guide).

export type GuideLookup = { token: string } | { tenantId: string }

export async function loadGuide(by: GuideLookup): Promise<{ content: GuideContent; business: GuideBusiness } | null> {
  if ('token' in by && !/^[a-f0-9]{32}$/.test(by.token)) return null
  const q = createServiceClient().from('tenants').select('name, sub_title, phone, address, logo_base64, guide_content')
  const { data: t, error } = await ('token' in by ? q.eq('guide_public_token', by.token) : q.eq('id', by.tenantId)).maybeSingle()
  if (error) console.error('[guide] load', error)
  if (!t) return null
  return {
    content: resolveGuide(t.guide_content),
    business: {
      name: t.name ?? '', subTitle: t.sub_title ?? '', phone: t.phone ?? '', address: t.address ?? '',
      logo: t.logo_base64 ?? null, ...await brandColors(t.logo_base64 ?? null),
    },
  }
}

/** Header colour taken from the garage's logo (falls back to a neutral blue). */
async function brandColors(logo: string | null): Promise<{ bg: string; accent: string }> {
  const m = logo?.match(/^data:image\/[\w.+-]+;base64,(.+)$/)
  if (!m) return { bg: '#0b3d91', accent: '#93c5fd' }
  try {
    return await logoPalette(await sharp(Buffer.from(m[1], 'base64')).png().toBuffer())
  } catch {
    return { bg: '#0b3d91', accent: '#93c5fd' }
  }
}

export function guideMetadata(businessName: string | undefined) {
  const title = businessName ? `מדריך הצמיגים – ${businessName}` : 'מדריך הצמיגים והגלגלים'
  const description = 'כיוון פרונט, מידע על הצמיגים ותיקון פנצ׳ר — בשפה פשוטה'
  return { title, description, openGraph: { title, description, locale: 'he_IL', type: 'website' as const } }
}
