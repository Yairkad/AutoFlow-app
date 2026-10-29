'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import LoansPanel from './LoansPanel'
import RequestsPanel from './RequestsPanel'
import QuickReportsPanel from './QuickReportsPanel'
import StockSummaryCards from './StockSummaryCards'
import NoStockPanel from './NoStockPanel'

type Tab = 'loans' | 'requests' | 'nostock' | 'reports'

const TABS: { value: Tab; icon: string; label: string; countKey?: string }[] = [
  { value: 'requests', icon: '⏳', label: 'לקוחות ממתינים', countKey: 'yard_requests' },
  { value: 'loans',    icon: '🔁', label: 'השאלות',          countKey: 'yard_loans' },
  { value: 'nostock',  icon: '📦', label: 'נמכר ללא מלאי',  countKey: 'no_stock' },
  { value: 'reports',  icon: '📊', label: 'דוחות' },
]

// Office view of everything the yard workers record — same panels and data as /yard.
export default function YardTrackingClient() {
  const [tab, setTab] = useState<Tab>('requests')
  const [counts, setCounts] = useState<Record<string, number>>({})

  // Open items per section (badge on the tab); refreshed when switching tabs
  useEffect(() => {
    fetch('/api/yard/counts').then(r => r.ok ? r.json() : {}).then(setCounts).catch(() => {})
  }, [tab])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={<span style={{ fontSize: 22 }}>📋</span>}
        iconBg="linear-gradient(135deg,#141A2E,#475569)"
        title="מעקב רחבה"
        subtitle="מה שהעובדים רושמים ברחבה — לקוחות שמחכים, השאלות, דוחות ושווי מלאי"
        marginBottom={0}
      />
      <StockSummaryCards />

      {/* Main tabs — underlined, clearly above the filters inside each section */}
      <div className="flex gap-1 border-b-2 border-slate-200 overflow-x-auto" role="tablist">
        {TABS.map(t => {
          const active = tab === t.value
          const n = t.countKey ? counts[t.countKey] ?? 0 : 0
          return (
            <button key={t.value} role="tab" aria-selected={active} onClick={() => setTab(t.value)}
              className={`flex items-center gap-2 font-bold whitespace-nowrap transition-colors ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              style={{ padding: '10px 16px', fontSize: 16, marginBottom: -2, borderBottom: `3px solid ${active ? '#141A2E' : 'transparent'}` }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
              {n > 0 && (
                <span className="bg-red-500 text-white rounded-full font-black" style={{ fontSize: 12, minWidth: 22, padding: '1px 7px', textAlign: 'center' }}>{n}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'loans'    && <LoansPanel variant="office" />}
      {tab === 'requests' && <RequestsPanel variant="office" />}
      {tab === 'nostock'  && <NoStockPanel variant="office" />}
      {tab === 'reports'  && <QuickReportsPanel variant="office" />}
    </div>
  )
}
