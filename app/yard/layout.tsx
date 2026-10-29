import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import KeyboardDismiss from '@/components/yard/KeyboardDismiss'
import YardShell from '@/components/yard/YardShell'
import YardLogin from '@/components/yard/YardLogin'
import { getYardEmployee } from '@/lib/auth/yard-token'

export const metadata: Metadata = {
  title: 'מסוף רחבה',
  description: 'מסוף עובד לקליטת רכבים וסריקת מוצרים',
  manifest: '/yard-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'רחבה' },
  icons: { apple: '/icon-192.png', icon: '/icon-512.png' },
}

export const viewport: Viewport = {
  themeColor: '#1B2448',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function YardLayout({ children }: { children: React.ReactNode }) {
  // The terminal is open to anyone at the counter: everyone picks their name + types their PIN.
  // Office (Gmail) sessions don't count here — only the PIN cookie does.
  const user = await getYardEmployee()
  if (!user) return <div className="yard-theme"><YardLogin /></div>

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="yard-theme" style={{ width: '100vw', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <YardShell isAdmin={user.isAdmin} modules={user.modules} userName={user.name}>
            {children}
          </YardShell>
          <KeyboardDismiss />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
