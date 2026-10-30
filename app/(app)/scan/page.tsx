import { redirect } from 'next/navigation'
import ScanClient from '@/components/scan/ScanClient'

export const metadata = { title: 'סריקת ברקוד' }

// Plain scanning is a tab of the stock screen now; /scan?count=1 stays the full-page scan count
export default async function ScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  if (sp.count !== '1') redirect('/stock-count?tab=scan')
  return <ScanClient />
}
