'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { suggestMatchesForLines, MatchCandidate } from '@/lib/bank-sync/matchSuggestions'
import { confirmMatch, ignoreLine, undoLine, createFromLine } from '@/lib/bank-sync/reconcileLine'
import { BankLine, BankSource, BankImport, LineStatus } from './types'

const SEL: React.CSSProperties = {
  padding: '7px 10px', fontSize: '13px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

const fmt = (n: number) => `₪${Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDMY = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}` }

const STATUS_LABELS: Record<LineStatus, string> = {
  unmatched: 'ללא התאמה', matched: 'הותאם', created: 'נוצר', ignored: 'הותעלם',
}
const IGNORE_REASONS = ['העברה פנימית', 'משיכת מזומן', 'אחר']

interface Props {
  tenantId: string
  userId: string | null
  expenseCats: string[]
  incomeCats: string[]
  sources: BankSource[]
  initialImportId?: string | null
}

export default function ReconciliationReview({ tenantId, userId, expenseCats, incomeCats, sources, initialImportId }: Props) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [lines, setLines] = useState<BankLine[]>([])
  const [imports, setImports] = useState<BankImport[]>([])
  const [suggestions, setSuggestions] = useState<Map<string, MatchCandidate[]>>(new Map())

  const [fImport, setFImport] = useState<string>(initialImportId ?? '')
  const [fSource, setFSource] = useState<string>('')
  const [fStatus, setFStatus] = useState<'unmatched' | 'all'>('unmatched')

  // Per-row transient UI state
  const [qc, setQc] = useState<Record<string, { category: string; description: string }>>({})
  const [pickedCandidate, setPickedCandidate] = useState<Record<string, string>>({})
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const toleranceBySource = useMemo(() => {
    const m = new Map<string, number>()
    sources.forEach(s => m.set(s.id, s.match_tolerance_days))
    return m
  }, [sources])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const [linesRes, impRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
      supabase.from('bank_statement_imports').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
    ])
    setLines((linesRes.data ?? []) as BankLine[])
    setImports((impRes.data ?? []) as BankImport[])
    setLoading(false)
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (initialImportId) setFImport(initialImportId) }, [initialImportId])

  const filtered = useMemo(() => lines.filter(l => {
    if (fImport && l.import_id !== fImport) return false
    if (fSource && l.source_id !== fSource) return false
    if (fStatus === 'unmatched' && l.status !== 'unmatched') return false
    return true
  }), [lines, fImport, fSource, fStatus])

  // Recompute suggestions whenever the visible unmatched set changes
  useEffect(() => {
    const unmatched = filtered.filter(l => l.status === 'unmatched')
    if (unmatched.length === 0) { setSuggestions(new Map()); return }
    suggestMatchesForLines(supabase, tenantId, unmatched, toleranceBySource).then(setSuggestions)
  }, [filtered, supabase, tenantId, toleranceBySource])

  const counts = useMemo(() => {
    const base = lines.filter(l => (!fImport || l.import_id === fImport) && (!fSource || l.source_id === fSource))
    return {
      total: base.length,
      unmatched: base.filter(l => l.status === 'unmatched').length,
      matched: base.filter(l => l.status === 'matched').length,
      created: base.filter(l => l.status === 'created').length,
      ignored: base.filter(l => l.status === 'ignored').length,
    }
  }, [lines, fImport, fSource])

  const byDay = useMemo(() => {
    const map: Record<string, BankLine[]> = {}
    filtered.forEach(l => { (map[l.date] ??= []).push(l) })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const exactSingleMatches = useMemo(() =>
    filtered.filter(l => l.status === 'unmatched' && (suggestions.get(l.id)?.length ?? 0) === 1 && suggestions.get(l.id)![0].dateDiffDays === 0),
    [filtered, suggestions])

  async function doConfirm(line: BankLine, candidate: MatchCandidate) {
    setBusyLine(line.id)
    const { error } = await confirmMatch(supabase, line.id, candidate.id, line.direction, userId, candidate.dateDiffDays === 0 ? 'exact' : 'approx')
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    load()
  }

  async function doBulkConfirm() {
    setBulkBusy(true)
    for (const l of exactSingleMatches) {
      const cand = suggestions.get(l.id)?.[0]
      if (!cand) continue
      await confirmMatch(supabase, l.id, cand.id, l.direction, userId, 'exact')
    }
    setBulkBusy(false)
    showToast(`אושרו ${exactSingleMatches.length} התאמות ✓`, 'success')
    load()
  }

  function qcFor(line: BankLine) {
    return qc[line.id] ?? {
      category: (line.direction === 'debit' ? expenseCats : incomeCats)[0] ?? 'אחר',
      description: line.description,
    }
  }

  async function doCreate(line: BankLine) {
    const state = qcFor(line)
    if (!state.category) { showToast('נא לבחור קטגוריה', 'error'); return }
    setBusyLine(line.id)
    const src = sources.find(s => s.id === line.source_id)
    const { error } = await createFromLine(
      supabase, tenantId, line.id, line.direction, line.date, line.amount,
      state.category, state.description.trim() || line.description,
      src?.default_payment_method ?? 'אשראי', userId,
    )
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    showToast('נוצרה רשומה חדשה ✓', 'success')
    load()
  }

  async function doIgnore(line: BankLine, reason: string) {
    setBusyLine(line.id)
    const { error } = await ignoreLine(supabase, line.id, reason, userId)
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    load()
  }

  async function doUndo(line: BankLine) {
    setBusyLine(line.id)
    const { error } = await undoLine(supabase, line.id)
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={fImport} onChange={e => setFImport(e.target.value)} style={SEL}>
          <option value="">כל הייבואים</option>
          {imports.map(i => <option key={i.id} value={i.id}>{i.file_name ?? i.id.slice(0, 8)} ({new Date(i.created_at).toLocaleDateString('he-IL')})</option>)}
        </select>
        <select value={fSource} onChange={e => setFSource(e.target.value)} style={SEL}>
          <option value="">כל המקורות</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['unmatched', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFStatus(f)} style={{
              padding: '7px 14px', border: '1px solid', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              borderColor: fStatus === f ? 'var(--primary)' : 'var(--border)',
              background: fStatus === f ? '#f0fdf6' : 'transparent',
              color: fStatus === f ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: fStatus === f ? 600 : 400,
            }}>{f === 'unmatched' ? 'ללא התאמה' : 'הצג הכל'}</button>
          ))}
        </div>
        {exactSingleMatches.length > 0 && (
          <Button size="sm" onClick={doBulkConfirm} loading={bulkBusy}>✓ אשר התאמות מדויקות ({exactSingleMatches.length})</Button>
        )}
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
        <span>סה״כ <b>{counts.total}</b></span>
        <span style={{ color: 'var(--warning)' }}>ללא התאמה <b>{counts.unmatched}</b></span>
        <span style={{ color: '#16a34a' }}>הותאמו <b>{counts.matched}</b></span>
        <span style={{ color: '#2563eb' }}>נוצרו <b>{counts.created}</b></span>
        <span style={{ color: 'var(--text-muted)' }}>הותעלמו <b>{counts.ignored}</b></span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>אין שורות להצגה.</div>
      ) : byDay.map(([day, dayLines]) => (
        <div key={day} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ background: '#f1f5f9', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
            <span>{fmtDMY(day)}</span>
            <span>{fmt(dayLines.reduce((s, l) => s + (l.direction === 'debit' ? -l.amount : l.amount), 0))}</span>
          </div>
          {dayLines.map((line, i) => {
            const candidates = suggestions.get(line.id) ?? []
            const state = qcFor(line)
            return (
              <div key={line.id} style={{ padding: '10px 14px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: line.direction === 'debit' ? '#fee2e2' : '#dcfce7', color: line.direction === 'debit' ? '#dc2626' : '#16a34a' }}>
                    {line.direction === 'debit' ? 'חובה' : 'זכות'}
                  </span>
                  <span style={{ fontSize: '13px', flex: 1 }}>{line.description}</span>
                  {line.card_number && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title="מספר כרטיס">💳 {line.card_number}</span>}
                  {line.charge_date && line.charge_date !== line.date && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title="תאריך חיוב">חיוב {fmtDMY(line.charge_date)}</span>}
                  <span style={{ fontWeight: 700 }}>{fmt(line.amount)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{STATUS_LABELS[line.status]}</span>
                  {line.status !== 'unmatched' && (
                    <RowActionsMenu actions={[
                      { key: 'raw', label: 'צפה בשורה גולמית', icon: '🔍', onClick: () => showToast(JSON.stringify(line.raw_row), 'info') },
                      { key: 'undo', label: 'בטל התאמה', icon: '↩', onClick: () => doUndo(line), danger: true },
                    ]} />
                  )}
                </div>

                {line.status === 'unmatched' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {candidates.length === 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px' }}>
                        <span>הצעה: {fmtDMY(candidates[0].date)} · {candidates[0].category} · {candidates[0].description}</span>
                        <Button size="sm" onClick={() => doConfirm(line, candidates[0])} loading={busyLine === line.id}>✓ אשר</Button>
                      </div>
                    )}
                    {candidates.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select value={pickedCandidate[line.id] ?? ''} onChange={e => setPickedCandidate(prev => ({ ...prev, [line.id]: e.target.value }))} style={SEL}>
                          <option value="">בחר התאמה ({candidates.length} אפשרויות)</option>
                          {candidates.map(c => <option key={c.id} value={c.id}>{fmtDMY(c.date)} · {c.category} · {c.description}</option>)}
                        </select>
                        <Button size="sm" disabled={!pickedCandidate[line.id]} onClick={() => {
                          const cand = candidates.find(c => c.id === pickedCandidate[line.id])
                          if (cand) doConfirm(line, cand)
                        }} loading={busyLine === line.id}>✓ אשר</Button>
                      </div>
                    )}
                    {candidates.length === 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <select value={state.category} onChange={e => setQc(prev => ({ ...prev, [line.id]: { ...state, category: e.target.value } }))} style={SEL}>
                          {(line.direction === 'debit' ? expenseCats : incomeCats).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input value={state.description} onChange={e => setQc(prev => ({ ...prev, [line.id]: { ...state, description: e.target.value } }))} style={{ ...SEL, minWidth: 160 }} />
                        <Button size="sm" onClick={() => doCreate(line)} loading={busyLine === line.id}>✓ צור {line.direction === 'debit' ? 'הוצאה' : 'הכנסה'}</Button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {IGNORE_REASONS.map(r => (
                        <button key={r} onClick={() => doIgnore(line, r)} title="התעלם" style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          🚫 {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
