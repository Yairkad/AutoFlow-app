import type { Metadata } from 'next'
import { Assistant } from 'next/font/google'
import { createServiceClient } from '@/lib/supabase/service'
import IntakeFormClient from '@/components/inspections/IntakeFormClient'

export const dynamic = 'force-dynamic'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '800'] })

// The link is shared over WhatsApp — its preview must say "purchase inspection", not the app.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  let business = ''
  if (/^[a-f0-9]{32}$/.test(token)) {
    try {
      const sb = createServiceClient()
      const { data } = await sb.from('car_inspections').select('tenant_id').eq('intake_token', token).maybeSingle()
      if (data) {
        const { data: t } = await sb.from('tenants').select('name').eq('id', data.tenant_id).maybeSingle()
        business = t?.name ?? ''
      }
    } catch { /* preview falls back to the generic title */ }
  }
  const title       = business ? `בדיקת קנייה – ${business}` : 'בדיקת קנייה'
  const description = 'מלאו פרטים לפני ההגעה ונחסוך לכם זמן במקום – כ־3 דקות'
  const image       = { url: '/og/inspection-intake.png', width: 1200, height: 630, alt: 'בדיקת קנייה' }
  return {
    metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
    title,
    description,
    openGraph:   { title, description, images: [image], locale: 'he_IL', type: 'website' },
    twitter:     { card: 'summary_large_image', title, description, images: [image.url] },
    appleWebApp: { title: 'בדיקת קנייה' },
    icons:       { icon: '/og/inspection-icon.png', apple: '/og/inspection-icon.png' },
    robots:      { index: false, follow: false },
  }
}

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className={assistant.className}>
      <IntakeFormClient token={token} />
    </div>
  )
}
