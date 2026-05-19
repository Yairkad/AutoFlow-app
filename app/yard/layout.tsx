import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import LandscapeLock from '@/components/yard/LandscapeLock'

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
    <ToastProvider>
      <ConfirmProvider>
        <LandscapeLock />
        <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 select-none">
          {children}
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
