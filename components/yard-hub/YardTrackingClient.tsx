'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import LoansPanel from './LoansPanel'
import RequestsPanel from './RequestsPanel'
import QuickReportsPanel from './QuickReportsPanel'
import StockSummaryCards from './StockSummaryCards'
import { Chips } from './ui'

type Tab = 'loans' | 'requests' | 'reports'

// Office view of everything the yard workers record — same panels and data as /yard.
export default function YardTrackingClient() {
  const [tab, setTab] = useState<Tab>('requests')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={<span style={{ fontSize: 22 }}>📋</span>}
        iconBg="linear-gradient(135deg,#0f172a,#475569)"
        title="מעקב רחבה"
        subtitle="השאלות, לקוחות ממתינים, דוחות ושווי מלאי — כל מה שהעובדים רושמים בשטח"
        marginBottom={0}
      />
      <StockSummaryCards />
      <Chips value={tab} onChange={setTab} options={[
        { value: 'requests', label: '⏳ לקוחות ממתינים' },
        { value: 'loans',    label: '🔁 השאלות' },
        { value: 'reports',  label: '📊 דוחות' },
      ]} />
      {tab === 'loans'    && <LoansPanel variant="office" />}
      {tab === 'requests' && <RequestsPanel variant="office" />}
      {tab === 'reports'  && <QuickReportsPanel variant="office" />}
    </div>
  )
}
