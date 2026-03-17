'use client'

import { useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'

export default function AppShell({ children, noFooter }: { children: React.ReactNode; noFooter?: boolean }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <>
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
        minHeight: 'calc(100vh - var(--header-h))',
      }}>
        {children}
      </main>
      {!noFooter && <Footer />}
    </>
  )
}
