import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { createServiceClient } from '@/lib/supabase/service'
import RouteProgress from '@/components/ui/RouteProgress'
import '@fontsource-variable/heebo/index.css'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-400.css'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-500.css'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-600.css'
import '@fontsource/ibm-plex-sans-hebrew/hebrew-700.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-400.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-500.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-600.css'
import '@fontsource/ibm-plex-sans-hebrew/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import './globals.css'

// Fonts are self-hosted (@fontsource) — next/font/google fetches them from Google on every build,
// and Turbopack (Next 16.1) breaks when Google answers with /l/font?kit=…&skey=… URLs (random build failures).
// The CSS variables --font-heebo / --font-ui / --font-num are defined in globals.css.
export async function generateMetadata(): Promise<Metadata> {
  try {
    // Service-role client: no session needed — works for social bots & crawlers too
    const supabase = createServiceClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, public_info')
      .limit(1)
      // Runs at build time for every static page — never let a slow/unreachable DB hang the build
      .abortSignal(AbortSignal.timeout(5000))
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
  themeColor: '#26357A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <RouteProgress />
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
