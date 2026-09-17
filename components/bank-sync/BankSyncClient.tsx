'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import PageHeader from '@/components/ui/PageHeader'
import ImportWizard from './ImportWizard'
import ReconciliationReview from './ReconciliationReview'
import SourcesTab from './SourcesTab'
import { BankSource } from './types'

const DEFAULT_EXPENSE_CATS = ['דלק', 'שכר', 'חשמל', 'מים', 'שכירות', 'ביטוח', 'ציוד', 'ניקיון', 'אחזקה', 'קניות מלאי', 'אחר']
const DEFAULT_INCOME_CATS  = ['שירות', 'צמיגים', 'מוצרים', 'מכירת רכב', 'אחר']

type Tab = 'import' | 'reconcile' | 'sources'

export default function BankSyncClient() {
  const supabase = useRef(createClient()).current
  const { profile } = useProfile()
  const tenantId = profile?.tenantId ?? ''
  const userId = profile?.userId ?? null

  const [tab, setTab] = useState<Tab>('import')
  const [sources, setSources] = useState<BankSource[]>([])
  const [expenseCats, setExpenseCats] = useState<string[]>(DEFAULT_EXPENSE_CATS)
  const [incomeCats, setIncomeCats] = useState<string[]>(DEFAULT_INCOME_CATS)
  const [reconcileImportId, setReconcileImportId] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase.from('bank_statement_sources').select('*').eq('tenant_id', tenantId).order('name')
    setSources((data ?? []) as BankSource[])
  }, [supabase, tenantId])

  useEffect(() => {
    if (!tenantId) return
    loadSources()
    supabase.from('expense_categories').select('name').eq('tenant_id', tenantId).order('created_at')
      .then(({ data }) => { if (data && data.length) setExpenseCats(data.map(r => r.name)) })
    supabase.from('income_categories').select('name').eq('tenant_id', tenantId).order('created_at')
      .then(({ data }) => { if (data && data.length) setIncomeCats(data.map(r => r.name)) })
  }, [tenantId, supabase, loadSources])

  if (!tenantId) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  return (
    <div>
      <PageHeader
        icon={<svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>}
        iconBg="linear-gradient(135deg,#0891b2,#22d3ee)"
        iconShadow="#0891b244"
        title="התאמת בנק / אשראי"
        subtitle="ייבוא דפי בנק וכרטיס אשראי, והתאמה מול הוצאות והכנסות קיימות"
      />

      <div style={{ display: 'flex', gap: '4px', padding: '4px', background: '#f1f5f9', borderRadius: '11px', marginBottom: '20px', width: 'fit-content' }}>
        {([
          ['import',    '📥 ייבוא'],
          ['reconcile', '🔗 התאמה'],
          ['sources',   '⚙️ מקורות'],
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

      {tab === 'import' && (
        <ImportWizard
          tenantId={tenantId}
          userId={userId}
          sources={sources}
          onSourcesChange={loadSources}
          onImported={(importId) => { setReconcileImportId(importId); setTab('reconcile') }}
        />
      )}
      {tab === 'reconcile' && (
        <ReconciliationReview
          tenantId={tenantId}
          userId={userId}
          expenseCats={expenseCats}
          incomeCats={incomeCats}
          sources={sources}
          initialImportId={reconcileImportId}
        />
      )}
      {tab === 'sources' && (
        <SourcesTab sources={sources} onChanged={loadSources} />
      )}
    </div>
  )
}
