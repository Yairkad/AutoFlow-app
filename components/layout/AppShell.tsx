'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'
import BackupReminder from './BackupReminder'
import YardDrawer from './YardDrawer'
import { ProfileProvider, useProfile } from '@/lib/contexts/ProfileContext'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()

  return (
    <ProfileProvider>
      <Header onMenuToggle={() => setMobileNavOpen(v => !v)} />
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Backdrop for mobile nav drawer */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="mobile-nav-backdrop"
        />
      )}

      <main className="yard-theme" style={{
        marginTop: 'var(--header-h)',
        marginRight: 'var(--sidebar-w)',
        marginLeft: 'var(--drawer-w, 0px)',
        transition: 'margin-left .2s',
        padding: '24px',
        height: 'calc(100vh - var(--header-h))',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <BackupReminder />
        {children}
      </main>
      {pathname !== '/dashboard' && <Footer />}
      <AdminYardDrawer />
    </ProfileProvider>
  )
}

// The drawer closes yard cards (office work) — shown to admins, like the office screen
function AdminYardDrawer() {
  const { profile } = useProfile()
  return profile?.isAdmin ? <YardDrawer /> : null
}
