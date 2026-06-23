import AppShell from '@/components/layout/AppShell'
import ScanClient from '@/components/scan/ScanClient'

export const metadata = { title: 'סריקת ברקוד' }

export default function ScanPage() {
  return <AppShell><ScanClient /></AppShell>
}
