import StockClient from '@/components/stock/StockClient'

export const metadata = { title: 'מלאי' }

// Stock: movements (invoice arrivals, yard sales, manual corrections), unstocked sales, reports and counts
export default function StockPage() {
  return <StockClient />
}
