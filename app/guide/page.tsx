import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Assistant } from 'next/font/google'
import { loadGuide, guideMetadata } from '@/lib/guide/server'
import { LANDING_TENANT_ID } from '@/lib/landingTenant'
import GuideView from '@/components/guide/GuideView'

// Short, fixed link to the site's own business guide (like the landing page at "/").
// Other garages use their QR link /guide/<token>.

export const dynamic = 'force-dynamic'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '800'] })

export async function generateMetadata(): Promise<Metadata> {
  const g = await loadGuide({ tenantId: LANDING_TENANT_ID }).catch(() => null)
  return guideMetadata(g?.business.name)
}

export default async function GuidePage() {
  const g = await loadGuide({ tenantId: LANDING_TENANT_ID })
  if (!g) notFound()
  return <div className={assistant.className}><GuideView content={g.content} business={g.business} legalLinks /></div>
}
