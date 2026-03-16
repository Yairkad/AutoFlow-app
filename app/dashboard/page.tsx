import AppShell from '@/components/layout/AppShell'
import DashboardStats from '@/components/dashboard/DashboardStats'
import RemindersPanel from '@/components/dashboard/RemindersPanel'
import AlertsPanel from '@/components/dashboard/AlertsPanel'

export default function DashboardPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: '1200px' }}>
        {/* Stats + reminders row */}
        <div style={{
          display: 'flex', gap: '20px', alignItems: 'stretch',
          height: 'calc(100vh - var(--header-h) - 48px)',
          overflow: 'hidden',
        }}>
          {/* Left column: stats on top, alerts bar at bottom */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <DashboardStats />
            </div>
            <AlertsPanel />
          </div>

          {/* Right column: reminders panel */}
          <RemindersPanel />
        </div>
      </div>
    </AppShell>
  )
}
