'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'
import { ProfileProvider } from '@/lib/contexts/ProfileContext'

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

      <main style={{
        marginTop: 'var(--header-h)',
        marginRight: 'var(--sidebar-w)',
        padding: '24px',
        height: 'calc(100vh - var(--header-h))',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {children}
      </main>
      {pathname !== '/dashboard' && <Footer />}
    </ProfileProvider>
  )
}
