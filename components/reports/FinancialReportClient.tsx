'use client'

import { useState } from 'react'
import { useProfile } from '@/lib/contexts/ProfileContext'
import PageHeader from '@/components/ui/PageHeader'
import UnifiedReportTab from './UnifiedReportTab'
import CashFlowForecastTab from './CashFlowForecastTab'

type Tab = 'unified' | 'forecast'

export default function FinancialReportClient() {
  const { profile } = useProfile()
  const tenantId = profile?.tenantId ?? ''
  const [tab, setTab] = useState<Tab>('unified')

  if (!tenantId) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>}
        iconBg="linear-gradient(135deg,#7c3aed,#a78bfa)"
        iconShadow="#7c3aed44"
        title="דוח כספי ותחזית"
        subtitle="תמונה חודשית מאוחדת (בפועל + פתוח) ותחזית יתרה קדימה"
      />

      <div style={{ display: 'flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px', marginBottom: '20px', width: 'fit-content' }}>
        {([
          ['unified', '📊 דוח מאוחד'],
          ['forecast', '📈 תחזית תזרים'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', borderRadius: '9px', border: 'none', fontSize: '13px', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 400,
            background: tab === t ? 'var(--bg-card)' : 'transparent',
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: tab === t ? 'var(--shadow)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'unified' ? <UnifiedReportTab tenantId={tenantId} /> : <CashFlowForecastTab tenantId={tenantId} />}
    </div>
  )
}
