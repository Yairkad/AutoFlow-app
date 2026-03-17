import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-heebo',
})

export const metadata: Metadata = {
  title: 'AutoFlow – מערכת עזר לניהול',
  description: 'מערכת ניהול לפנצריה ומוסך',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AutoFlow',
    startupImage: '/icon-512.png',
  },
  icons: {
    apple: '/icon-192.png',
    icon: '/icon-512.png',
  },
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
