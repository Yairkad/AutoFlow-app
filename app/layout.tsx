import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-heebo',
})

export async function generateMetadata(): Promise<Metadata> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', session.user.id)
        .single()

      if (profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, public_info')
          .eq('id', profile.tenant_id)
          .single()

        if (tenant) {
          const info = tenant.public_info as { meta_title?: string; meta_description?: string } | null
          const title       = info?.meta_title       || (tenant.name ? `${tenant.name} – מערכת ניהול` : 'AutoFlow – מערכת ניהול')
          const description = info?.meta_description || 'מערכת ניהול לפנצריה ומוסך'
          return {
            title,
            description,
            manifest: '/manifest.webmanifest',
            appleWebApp: { capable: true, statusBarStyle: 'default', title: tenant.name || 'AutoFlow', startupImage: '/icon-512.png' },
            icons: { apple: '/icon-192.png', icon: '/icon-512.png' },
          }
        }
      }
    }
  } catch { /* no session / DB error – fall through to defaults */ }

  return {
    title: 'AutoFlow – מערכת עזר לניהול',
    description: 'מערכת ניהול לפנצריה ומוסך',
    manifest: '/manifest.webmanifest',
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
