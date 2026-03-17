import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { createServiceClient } from '@/lib/supabase/service'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-heebo',
})

export async function generateMetadata(): Promise<Metadata> {
  try {
    // Service-role client: no session needed — works for social bots & crawlers too
    const supabase = createServiceClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, public_info')
      .limit(1)
      .single()

    if (tenant) {
      const info        = tenant.public_info as { meta_title?: string; meta_description?: string } | null
      const title       = info?.meta_title       || (tenant.name ? `${tenant.name} – מערכת ניהול` : 'AutoFlow – מערכת ניהול')
      const description = info?.meta_description || 'מערכת ניהול לפנצריה ומוסך'
      const shortName   = tenant.name || 'AutoFlow'
      return {
        title,
        description,
        manifest: '/manifest.webmanifest',
        openGraph: { title, description, locale: 'he_IL', type: 'website' },
        appleWebApp: { capable: true, statusBarStyle: 'default', title: shortName, startupImage: '/icon-512.png' },
        icons: { apple: '/icon-192.png', icon: '/icon-512.png' },
      }
    }
  } catch { /* DB error – fall through to defaults */ }

  return {
    title: 'AutoFlow – מערכת עזר לניהול',
    description: 'מערכת ניהול לפנצריה ומוסך',
    manifest: '/manifest.webmanifest',
    openGraph: { title: 'AutoFlow – מערכת עזר לניהול', description: 'מערכת ניהול לפנצריה ומוסך', locale: 'he_IL', type: 'website' },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AutoFlow', startupImage: '/icon-512.png' },
    icons: { apple: '/icon-192.png', icon: '/icon-512.png' },
  }
}

export const viewport: Viewport = {
  themeColor: '#1a9e5c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
