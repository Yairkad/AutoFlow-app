'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import RowActionsMenu from '@/components/ui/RowActionsMenu'
import { suggestMatchesForLines, MatchCandidate } from '@/lib/bank-sync/matchSuggestions'
import { confirmMatch, ignoreLine, undoLine, createFromLine, linkCreated } from '@/lib/bank-sync/reconcileLine'
import { classifyDebit, type Classified, type CheckRow, type SupplierRow } from '@/lib/bank-sync/classifyLine'
import { markScheduledPaymentPaid } from '@/lib/utils/markCheckPaid'
import { recordSupplierPayment } from '@/lib/debts/supplierDirectPayments'
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

/** Description without numbers / extra spaces — "עמלת פעולה 1234" and "עמלת פעולה 5678" are the same rule */
const ruleKey = (desc: string) => desc.replace(/[\d.,/:#*-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

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
  const [fStatus, setFStatus] = useState<'missing' | 'unmatched' | 'all'>('missing')

  // Per-row transient UI state
  const [qc, setQc] = useState<Record<string, { category: string; description: string }>>({})
  const [pickedCandidate, setPickedCandidate] = useState<Record<string, string>>({})
  const [busyLine, setBusyLine] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  // Categories typed here that aren't in the fixed lists yet (saved on first use)
  const [extraExp, setExtraExp] = useState<string[]>([])
  const [extraInc, setExtraInc] = useState<string[]>([])
  const expCats = useMemo(() => [...new Set([...expenseCats, ...extraExp])], [expenseCats, extraExp])
  const incCats = useMemo(() => [...new Set([...incomeCats, ...extraInc])], [incomeCats, extraInc])
  // Learned "description → category" per source (kept in the source's column_mapping.rules)
  const [rules, setRules] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(sources.map(s => [s.id, s.column_mapping?.rules ?? {}])))
  useEffect(() => {
    setRules(prev => ({ ...Object.fromEntries(sources.map(s => [s.id, s.column_mapping?.rules ?? {}])), ...prev }))
  }, [sources])
  const ruleFor = useCallback((line: BankLine) => {
    const k = ruleKey(line.description)
    if (!k) return undefined
    if (line.source_id && rules[line.source_id]?.[k]) return rules[line.source_id][k]
    for (const r of Object.values(rules)) if (r[k]) return r[k]   // learned on another source
    return undefined
  }, [rules])

  const toleranceBySource = useMemo(() => {
    const m = new Map<string, number>()
    sources.forEach(s => m.set(s.id, s.match_tolerance_days))
    return m
  }, [sources])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const [linesRes, impRes, checksRes, suppRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('*').eq('tenant_id', tenantId).order('date', { ascending: true }),
      supabase.from('bank_statement_imports').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('scheduled_payments').select('id, check_number, amount, due_date, is_paid, expense_id, supplier_id, description, notes, payment_method')
        .eq('tenant_id', tenantId).eq('payment_method', 'check'),
      supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId),
    ])
    setLines((linesRes.data ?? []) as BankLine[])
    setImports((impRes.data ?? []) as BankImport[])
    setChecks((checksRes.data ?? []) as CheckRow[])
    setSuppliers((suppRes.data ?? []) as SupplierRow[])
    setLoading(false)
  }, [supabase, tenantId])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (initialImportId) setFImport(initialImportId) }, [initialImportId])

  const filtered = useMemo(() => lines.filter(l => {
    if (fImport && l.import_id !== fImport) return false
    if (fSource && l.source_id !== fSource) return false
    if (fStatus !== 'all' && l.status !== 'unmatched') return false
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

  // Check number of a line = its "אסמכתא" cell (kept in raw_row, mapped on the source)
  const referenceOf = useCallback((l: BankLine) => {
    const col = sources.find(s => s.id === l.source_id)?.column_mapping?.columns?.reference
    const row = Array.isArray(l.raw_row) ? l.raw_row : null
    return col != null && row ? String(row[col] ?? '').trim() || null : null
  }, [sources])

  // What each unmatched debit line is (check / card charge / supplier / fee / other)
  const classified = useMemo(() => {
    const claimed = new Set<string>(lines.filter(l => l.matched_expense_id).map(l => `e:${l.matched_expense_id}`))
    const out = new Map<string, Classified>()
    for (const l of lines) {
      if (l.status !== 'unmatched' || l.direction !== 'debit') continue
      const c = classifyDebit({ description: l.description, amount: Number(l.amount), reference: referenceOf(l) }, checks, suppliers, claimed)
      if (c.check) claimed.add(c.check.id)
      out.set(l.id, c)
    }
    return out
  }, [lines, checks, suppliers, referenceOf])

  // Money that left the bank and isn't recorded anywhere: no matching expense, not a check from
  // the journal, not the card's monthly charge (its purchases come from the card statement)
  const isMissing = useCallback((l: BankLine) => {
    if (l.status !== 'unmatched' || l.direction !== 'debit') return false
    if ((suggestions.get(l.id)?.length ?? 0) > 0) return false
    const k = classified.get(l.id)?.kind
    return k !== 'card' && k !== 'check'
  }, [suggestions, classified])

  const missing = useMemo(() => lines.filter(l =>
    (!fImport || l.import_id === fImport) && (!fSource || l.source_id === fSource) && isMissing(l)), [lines, fImport, fSource, isMissing])
  const missingTotal = missing.reduce((s, l) => s + Number(l.amount), 0)

  const shown = useMemo(() => fStatus === 'missing' ? filtered.filter(isMissing) : filtered, [filtered, fStatus, isMissing])

  const byDay = useMemo(() => {
    const map: Record<string, BankLine[]> = {}
    shown.forEach(l => { (map[l.date] ??= []).push(l) })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const cardLines = useMemo(() => filtered.filter(l => classified.get(l.id)?.kind === 'card'), [filtered, classified])

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
    return qc[line.id] ?? { category: ruleFor(line) ?? classified.get(line.id)?.category ?? '', description: line.description }
  }

  // New category → add it to the tenant's expense/income categories
  async function ensureCategory(direction: 'debit' | 'credit', name: string) {
    const list = direction === 'debit' ? expCats : incCats
    if (list.includes(name)) return
    await supabase.from(direction === 'debit' ? 'expense_categories' : 'income_categories').insert({ tenant_id: tenantId, name })
    if (direction === 'debit') setExtraExp(x => [...x, name]); else setExtraInc(x => [...x, name])
  }

  // Remember "this description → this category" on the line's source
  async function learnRule(line: BankLine, category: string) {
    const k = ruleKey(line.description)
    if (!k || !line.source_id) return
    const src = sources.find(s => s.id === line.source_id)
    if (!src) return
    const next = { ...(rules[line.source_id] ?? {}), [k]: category }
    setRules(r => ({ ...r, [line.source_id!]: next }))
    await supabase.from('bank_statement_sources').update({ column_mapping: { ...src.column_mapping, rules: next } }).eq('id', src.id)
  }

  async function doCreate(line: BankLine) {
    const state = qcFor(line)
    const category = state.category.trim()
    if (!category) { showToast('נא לבחור או להקליד קטגוריה', 'error'); return }
    setBusyLine(line.id)
    await ensureCategory(line.direction, category)
    const src = sources.find(s => s.id === line.source_id)
    const { error } = await createFromLine(
      supabase, tenantId, line.id, line.direction, line.date, line.amount,
      category, state.description.trim() || line.description,
      src?.default_payment_method ?? 'אשראי', userId,
    )
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    await learnRule(line, category)
    showToast('נוצרה רשומה חדשה ✓', 'success')
    load()
  }

  // Lines with no matching expense whose category is already known from an earlier line
  const ruleReady = useMemo(() =>
    filtered.filter(l => l.status === 'unmatched' && (suggestions.get(l.id)?.length ?? 0) === 0 && !!ruleFor(l)),
    [filtered, suggestions, ruleFor])

  async function doBulkCreate() {
    setBulkBusy(true)
    let n = 0
    for (const l of ruleReady) {
      const src = sources.find(s => s.id === l.source_id)
      const { error } = await createFromLine(supabase, tenantId, l.id, l.direction, l.date, l.amount,
        ruleFor(l)!, l.description, src?.default_payment_method ?? 'אשראי', userId)
      if (!error) n++
    }
    setBulkBusy(false)
    showToast(`נוצרו ${n} רשומות לפי קטגוריות שמורות ✓`, 'success')
    load()
  }

  // "שיק" line ↔ check in the journal: link to its expense (marking the check paid first if needed)
  async function doCheck(line: BankLine, check: CheckRow) {
    setBusyLine(line.id)
    let expenseId = check.expense_id
    if (!check.is_paid || !expenseId) {
      const r = await markScheduledPaymentPaid(supabase, tenantId, check, {
        paidDate: line.date, category: 'ספקים', description: check.description || `צ'ק ${check.check_number ?? ''}`,
      })
      if (r.error || !r.expenseId) { setBusyLine(null); showToast('שגיאה: ' + (r.error ?? ''), 'error'); return }
      expenseId = r.expenseId
    }
    const { error } = await (check.is_paid && check.expense_id
      ? confirmMatch(supabase, line.id, expenseId, 'debit', userId, 'exact')
      : linkCreated(supabase, line.id, 'debit', expenseId, userId))
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    showToast(`צ'ק ${check.check_number ?? ''} סומן כנפרע ✓`, 'success')
    load()
  }

  // "העברה אל: <supplier>" → a supplier payment (lowers the supplier's balance)
  async function doSupplier(line: BankLine, supp: SupplierRow) {
    setBusyLine(line.id)
    const r = await recordSupplierPayment(supabase, {
      tenantId, supplierId: supp.id, supplierName: supp.name, amount: Number(line.amount), date: line.date,
      method: 'העברה', ref: referenceOf(line),
    })
    if (r.error || !r.expenseId) { setBusyLine(null); showToast('שגיאה: ' + (r.error ?? ''), 'error'); return }
    const { error } = await linkCreated(supabase, line.id, 'debit', r.expenseId, userId)
    setBusyLine(null)
    if (error) { showToast('שגיאה: ' + error, 'error'); return }
    showToast(`נרשם תשלום ל${supp.name} ✓`, 'success')
    load()
  }

  async function doIgnoreCards() {
    setBulkBusy(true)
    for (const l of cardLines) await ignoreLine(supabase, l.id, 'חיוב כרטיס אשראי', userId)
    setBulkBusy(false)
    showToast(`${cardLines.length} חיובי כרטיס סומנו ✓`, 'success')
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
      <datalist id="cats-debit">{expCats.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="cats-credit">{incCats.map(c => <option key={c} value={c} />)}</datalist>
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
          {(['missing', 'unmatched', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFStatus(f)} style={{
              padding: '7px 14px', border: '1px solid', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              borderColor: fStatus === f ? 'var(--primary)' : 'var(--border)',
              background: fStatus === f ? 'var(--success-soft)' : 'transparent',
              color: fStatus === f ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: fStatus === f ? 600 : 400,
            }}>{f === 'missing' ? `לא רשום במערכת (${missing.length})` : f === 'unmatched' ? 'כל הפתוחות' : 'הצג הכל'}</button>
          ))}
        </div>
        {exactSingleMatches.length > 0 && (
          <Button size="sm" onClick={doBulkConfirm} loading={bulkBusy}>✓ אשר התאמות מדויקות ({exactSingleMatches.length})</Button>
        )}
        {cardLines.length > 0 && (
          <Button size="sm" variant="secondary" onClick={doIgnoreCards} loading={bulkBusy}>💳 דלג על חיובי כרטיס ({cardLines.length})</Button>
        )}
        {ruleReady.length > 0 && (
          <Button size="sm" onClick={doBulkCreate} loading={bulkBusy}>✓ צור לפי קטגוריות שמורות ({ruleReady.length})</Button>
        )}
      </div>

      {/* The point of the screen: what left the bank and isn't recorded */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius)',
        background: missing.length ? '#fef2f2' : 'var(--success-soft)', border: `1px solid ${missing.length ? '#fecaca' : '#bbf7d0'}` }}>
        <span style={{ fontSize: 22 }}>{missing.length ? '💸' : '✅'}</span>
        <div style={{ fontSize: 14 }}>
          {missing.length
            ? <>יצאו מהבנק ולא רשומים במערכת: <b>{missing.length}</b> תנועות · <b style={{ color: 'var(--danger)' }}>{fmt(missingTotal)}</b></>
            : <b>כל ההוצאות מהבנק רשומות במערכת</b>}
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 16px' }}>
        <span>סה״כ <b>{counts.total}</b></span>
        <span style={{ color: 'var(--warning)' }}>ללא התאמה <b>{counts.unmatched}</b></span>
        <span style={{ color: 'var(--success)' }}>הותאמו <b>{counts.matched}</b></span>
        <span style={{ color: '#2563eb' }}>נוצרו <b>{counts.created}</b></span>
        <span style={{ color: 'var(--text-muted)' }}>הותעלמו <b>{counts.ignored}</b></span>
      </div>

      {shown.length === 0 ? (
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
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: line.direction === 'debit' ? '#fee2e2' : 'var(--success-soft)', color: line.direction === 'debit' ? '#dc2626' : 'var(--success)' }}>
                    {line.direction === 'debit' ? 'חובה' : 'זכות'}
                  </span>
                  <span style={{ fontSize: '13px', flex: 1 }}>{line.description}</span>
                  {line.card_number && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title="מספר כרטיס">💳 {line.card_number}</span>}
                  {line.charge_date && line.charge_date !== line.date && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} title="תאריך חיוב">חיוב {fmtDMY(line.charge_date)}</span>}
                  <span style={{ fontWeight: 700 }}>{fmt(line.amount)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{STATUS_LABELS[line.status]}</span>
                  {line.status !== 'unmatched' ? (
                    <RowActionsMenu actions={[
                      { key: 'raw', label: 'צפה בשורה גולמית', icon: '🔍', onClick: () => showToast(JSON.stringify(line.raw_row), 'info') },
                      { key: 'undo', label: 'בטל התאמה', icon: '↩', onClick: () => doUndo(line), danger: true },
                    ]} />
                  ) : (
                    <RowActionsMenu actions={IGNORE_REASONS.map(r => ({ key: r, label: `התעלם — ${r}`, icon: '🚫', onClick: () => doIgnore(line, r) }))} />
                  )}
                </div>

                {line.status === 'unmatched' && (() => {
                  const cl = classified.get(line.id)
                  const box: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', flexWrap: 'wrap' }
                  if (cl?.kind === 'check' && cl.check) return (
                    <div style={{ ...box, background: '#fef9c3', border: '1px solid #fde68a' }}>
                      <span>📝 צ&apos;ק {cl.check.check_number ? `#${cl.check.check_number}` : ''} ביומן הצ&apos;קים · {fmt(cl.check.amount)} · {cl.check.description}</span>
                      <Button size="sm" onClick={() => doCheck(line, cl.check!)} loading={busyLine === line.id}>✓ {cl.check.is_paid ? 'התאם' : 'סמן כנפרע'}</Button>
                    </div>
                  )
                  if (cl?.kind === 'card' && candidates.length === 0) return (
                    <div style={{ ...box, background: '#f1f5f9', border: '1px solid var(--border)' }}>
                      <span>💳 חיוב חודשי של כרטיס אשראי — העסקאות עצמן נבדקות מדף האשראי</span>
                      <Button size="sm" variant="secondary" onClick={() => doIgnore(line, 'חיוב כרטיס אשראי')} loading={busyLine === line.id}>דלג</Button>
                    </div>
                  )
                  return null
                })()}
                {line.status === 'unmatched' && classified.get(line.id)?.kind !== 'check' && !(classified.get(line.id)?.kind === 'card' && candidates.length === 0) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {candidates.length === 0 && classified.get(line.id)?.kind === 'supplier' && (() => {
                      const supp = classified.get(line.id)!.supplier!
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 10px', fontSize: '12px' }}>
                          <span>🏭 {supp.name}</span>
                          <Button size="sm" onClick={() => doSupplier(line, supp)} loading={busyLine === line.id}>✓ רשום תשלום לספק</Button>
                          <span style={{ color: 'var(--text-muted)' }}>או:</span>
                        </div>
                      )
                    })()}
                    {candidates.length === 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--success-soft)', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px' }}>
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
                        <input list={`cats-${line.direction}`} value={state.category} placeholder="קטגוריה (בחר או הקלד חדשה)" aria-label="קטגוריה"
                          onChange={e => setQc(prev => ({ ...prev, [line.id]: { ...state, category: e.target.value } }))} style={{ ...SEL, minWidth: 170 }} />
                        <input value={state.description} onChange={e => setQc(prev => ({ ...prev, [line.id]: { ...state, description: e.target.value } }))} style={{ ...SEL, minWidth: 160 }} />
                        <Button size="sm" onClick={() => doCreate(line)} loading={busyLine === line.id}>✓ צור {line.direction === 'debit' ? 'הוצאה' : 'הכנסה'}</Button>
                      </div>
                    )}

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
