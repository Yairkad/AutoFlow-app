'use client'

import AppShell from '@/components/layout/AppShell'
import DashboardStats from '@/components/dashboard/DashboardStats'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import RemindersPanel from '@/components/dashboard/RemindersPanel'
import AlertsPanel from '@/components/dashboard/AlertsPanel'
import { useState } from 'react'

type DashTab = 'stats' | 'charts'

export default function DashboardPage() {
  const [tab, setTab] = useState<DashTab>('stats')

  return (
    <AppShell noFooter>
      <div style={{ width: '100%' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          {([
            ['stats',  '📊 סטטיסטיקות'],
            ['charts', '📈 גרפים'],
          ] as [DashTab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '10px 20px', fontSize: '14px',
                fontWeight: tab === t ? 700 : 400,
                color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: '-1px', transition: 'all .15s',
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
                height: 'calc(100vh - var(--header-h) - 96px)',
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
          <div style={{ height: 'calc(100vh - var(--header-h) - 96px)', overflowY: 'auto' }}>
            <DashboardCharts />
          </div>
        )}
      </div>
    </AppShell>
  )
}
