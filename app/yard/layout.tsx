import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import KeyboardDismiss from '@/components/yard/KeyboardDismiss'

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
        <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
          <KeyboardDismiss />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
