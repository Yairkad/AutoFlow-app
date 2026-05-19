import AppShell from '@/components/layout/AppShell'
import InventoryCountClient from '@/components/tires/InventoryCountClient'

export const metadata = { title: 'ספירת מלאי' }

export default function InventoryCountPage() {
  return <AppShell><InventoryCountClient /></AppShell>
}
