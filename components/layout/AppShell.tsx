import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <Sidebar />
      <main style={{
        marginTop: 'var(--header-h)',
        marginRight: 'var(--sidebar-w)',
        padding: '24px',
        minHeight: 'calc(100vh - var(--header-h))',
      }}>
        {children}
      </main>
      <Footer />
    </>
  )
}
