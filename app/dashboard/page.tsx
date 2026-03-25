'use client'

import AppShell from '@/components/layout/AppShell'
import DashboardStats from '@/components/dashboard/DashboardStats'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import RemindersPanel from '@/components/dashboard/RemindersPanel'
import AlertsPanel from '@/components/dashboard/AlertsPanel'
import Footer from '@/components/layout/Footer'
import { useState } from 'react'

type DashTab = 'stats' | 'charts'

export default function DashboardPage() {
  const [tab, setTab] = useState<DashTab>('stats')

  return (
    <AppShell noFooter>
      <div style={{ width: '100%' }}>

        {/* Tab bar */}
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '11px', padding: '4px', gap: '4px', marginBottom: '20px' }}>
          {([
            ['stats',  '📊 סטטיסטיקות'],
            ['charts', '📈 גרפים'],
          ] as [DashTab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '8px 20px', fontSize: '13px',
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
                background: tab === t ? '#fff' : 'transparent',
                borderRadius: '8px',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                transition: 'all .15s', whiteSpace: 'nowrap',
              }}
            >{label}</button>
          ))}
        </div>

        {tab === 'stats' ? (
          <>
            {/* Stats + reminders row */}
            <div
              className="dash-layout"
              style={{
                display: 'flex', gap: '20px', alignItems: 'stretch',
                height: 'calc(100vh - var(--header-h) - 140px)',
                overflow: 'hidden',
              }}
            >
              {/* Left column: stats on top, alerts bar at bottom */}
              <div
                className="dash-stats-col"
                style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}
              >
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <DashboardStats />
                </div>
                <div className="dash-alerts-desktop">
                  <AlertsPanel />
                </div>
              </div>

              {/* Right column: reminders panel */}
              <div className="dash-reminders-desktop" style={{ height: '100%' }}>
                <RemindersPanel />
              </div>
            </div>

            {/* Mobile-only sticky bottom bar */}
            <div className="dash-mobile-bottom">
              <AlertsPanel compact />
              <RemindersPanel compact />
            </div>
          </>

        ) : (
          /* Charts tab */
          <div style={{ height: 'calc(100vh - var(--header-h) - 140px)', overflowY: 'auto' }}>
            <DashboardCharts />
          </div>
        )}
      </div>
      <div className="dash-footer-area"><Footer inner /></div>
    </AppShell>
  )
}
