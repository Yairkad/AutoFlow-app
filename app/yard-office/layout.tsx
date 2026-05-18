import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import '@/app/globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['400','600','700','800'], variable: '--font-heebo' })

export const metadata: Metadata = {
  title: 'לוח בקרה רחבה',
  manifest: '/yard-office-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'משרד רחבה' },
}

export const viewport: Viewport = {
  themeColor: '#1e293b',
  width: 'device-width',
  initialScale: 1,
}

export default function YardOfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="bg-slate-100 font-sans">
        <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>
      </body>
    </html>
  )
}
