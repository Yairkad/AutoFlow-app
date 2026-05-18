import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import '@/app/globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-heebo',
})

export const metadata: Metadata = {
  title: 'מסוף רחבה',
  description: 'מסוף עובד לקליטת רכבים וסריקת מוצרים',
  manifest: '/yard-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'רחבה' },
  icons: { apple: '/icon-192.png', icon: '/icon-512.png' },
}

export const viewport: Viewport = {
  themeColor: '#1e293b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function YardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="bg-slate-100 font-sans select-none overflow-hidden">
        <ToastProvider>
          <ConfirmProvider>
            <div className="h-screen w-screen overflow-hidden flex flex-col">
              {children}
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
