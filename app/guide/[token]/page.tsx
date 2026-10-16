import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Assistant } from 'next/font/google'
import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/service'
import { logoPalette } from '@/lib/og/logoColors'
import { resolveGuide } from '@/lib/guide/content'
import GuideView, { type GuideBusiness } from '@/components/guide/GuideView'

// Public tire & wheel guide — customers reach it by scanning the garage's QR.
// The token is tenants.guide_public_token (created from Settings), never the tenant id.

export const dynamic = 'force-dynamic'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '800'] })

async function getGuideTenant(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const { data } = await createServiceClient()
    .from('tenants').select('name, sub_title, phone, address, logo_base64, guide_content')
    .eq('guide_public_token', token).maybeSingle()
  return data
}

/** Header colour taken from the garage's logo (falls back to a neutral blue). */
async function brandColors(logo: string | null): Promise<{ bg: string; accent: string }> {
  const m = logo?.match(/^data:image\/[\w.+-]+;base64,(.+)$/)
  if (!m) return { bg: '#0b3d91', accent: '#93c5fd' }
  try {
    const png = await sharp(Buffer.from(m[1], 'base64')).png().toBuffer()
    return await logoPalette(png)
  } catch {
    return { bg: '#0b3d91', accent: '#93c5fd' }
  }
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const t = await getGuideTenant(token).catch(() => null)
  const title = t?.name ? `מדריך הצמיגים – ${t.name}` : 'מדריך הצמיגים והגלגלים'
  const description = 'כיוון פרונט, מידע על הצמיגים ותיקון פנצ׳ר — בשפה פשוטה'
  return { title, description, openGraph: { title, description, locale: 'he_IL', type: 'website' }, robots: { index: false, follow: false } }
}

export default async function GuidePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getGuideTenant(token)
  if (!t) notFound()
  const colors = await brandColors(t.logo_base64 ?? null)
  const business: GuideBusiness = {
    name: t.name ?? '', subTitle: t.sub_title ?? '', phone: t.phone ?? '', address: t.address ?? '',
    logo: t.logo_base64 ?? null, ...colors,
  }
  return (
    <div className={assistant.className}>
      <GuideView content={resolveGuide(t.guide_content)} business={business} />
    </div>
  )
}
