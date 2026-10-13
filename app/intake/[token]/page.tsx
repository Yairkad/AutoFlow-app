import type { Metadata } from 'next'
import { Assistant } from 'next/font/google'
import { getIntakeTenant } from '@/lib/og/intakeTenant'
import IntakeFormClient from '@/components/inspections/IntakeFormClient'

export const dynamic = 'force-dynamic'

const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '800'] })

function logoVersion(logo: string) {
  let h = 0
  for (let i = 0; i < logo.length; i += 97) h = (h * 31 + logo.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + logo.length.toString(36)
}

// The link is shared over WhatsApp — its preview must say "purchase inspection", not the app.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const tenant = await getIntakeTenant(token).catch(() => null)  // preview falls back to the generic title
  const business    = tenant?.name ?? ''
  const title       = business ? `בדיקת קנייה – ${business}` : 'בדיקת קנייה'
  const description = 'מלאו פרטים לפני ההגעה ונחסוך לכם זמן במקום – כ־3 דקות'
  // Businesses with a logo get a preview branded with it; `v` changes with the logo so
  // WhatsApp/Facebook re-fetch after it is replaced.
  const imageUrl    = tenant?.logo
    ? `/api/public/og/intake?t=${token}&v=${logoVersion(tenant.logo)}`
    : '/og/inspection-intake.png'
  const image       = { url: imageUrl, width: 1200, height: 630, alt: business ? `בדיקת קנייה – ${business}` : 'בדיקת קנייה' }
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
