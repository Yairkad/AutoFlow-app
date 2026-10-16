import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Assistant } from 'next/font/google'
import { loadGuide, guideMetadata } from '@/lib/guide/server'
import GuideView from '@/components/guide/GuideView'

// Public tire & wheel guide — customers reach it by scanning the garage's QR.
// The token is tenants.guide_public_token (created from Settings), never the tenant id.

export const dynamic = 'force-dynamic'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '800'] })

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const g = await loadGuide({ token }).catch(() => null)
  return { ...guideMetadata(g?.business.name), robots: { index: false, follow: false } }
}

export default async function GuideTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const g = await loadGuide({ token })
  if (!g) notFound()
  return <div className={assistant.className}><GuideView content={g.content} business={g.business} /></div>
}
