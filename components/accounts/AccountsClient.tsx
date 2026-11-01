'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/lib/contexts/ProfileContext'
import PageHeader from '@/components/ui/PageHeader'
import SuppliersClient from '@/components/suppliers/SuppliersClient'
import CustomersClient from '@/components/customers/CustomersClient'

type Tab = 'suppliers' | 'customers'

// Running accounts with third parties in one place: suppliers | ledger customers.
// Contact details live on the contacts page (/contacts).
export default function AccountsClient() {
  const { profile } = useProfile()
  const mods = profile?.allowedModules ?? []
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const tabs = ([['suppliers', 'ספקים'], ['customers', 'לקוחות']] as [Tab, string][])
    .filter(([t]) => isAdmin || mods.includes(t))
  const [tab, setTab] = useState<Tab | null>(null)

  // ?tab=customers (old /customers links redirect here) — read once
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'suppliers' || t === 'customers') { const id = setTimeout(() => setTab(t), 0); return () => clearTimeout(id) }
  }, [])
  const active = tab && tabs.some(([t]) => t === tab) ? tab : tabs[0]?.[0] ?? null

  function pick(t: Tab) {
    setTab(t)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', t); url.searchParams.delete('open')
    window.history.replaceState(null, '', url)
  }

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
        title="חשבונות"
        subtitle="חשבון רץ מול ספקים ולקוחות כרטסת"
      />
      {tabs.length > 1 && (
        <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 11, width: 'fit-content', maxWidth: '100%', marginBottom: 16 }}>
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={active === t} onClick={() => pick(t)} style={{
              padding: '8px 22px', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
              background: active === t ? '#fff' : 'transparent', color: active === t ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: active === t ? 700 : 400, boxShadow: active === t ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            }}>{label}</button>
          ))}
        </div>
      )}
      {active === 'suppliers' && <SuppliersClient embedded />}
      {active === 'customers' && <CustomersClient embedded />}
    </div>
  )
}
