import type { Metadata, Viewport } from 'next'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

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
    <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>
  )
}
