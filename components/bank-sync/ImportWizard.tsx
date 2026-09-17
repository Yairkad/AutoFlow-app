'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  readRawRows, applyMapping, guessMapping,
  ColumnMapping, AmountMode, AmountSign, ParsedLine,
} from '@/lib/bank-sync/parseStatementFile'
import { BankSource } from './types'

const SEL: React.CSSProperties = {
  padding: '8px 12px', fontSize: '13px',
  border: '1.5px solid var(--border)', borderRadius: '9px',
  background: '#f8fafc', color: 'var(--text)', fontFamily: 'inherit', outline: 'none',
}

type Role = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'chargeDate' | 'cardNumber' | 'ignore'

const ROLE_LABELS: Record<Role, string> = {
  date: 'תאריך עסקה', description: 'תיאור', amount: 'סכום',
  debit: 'חובה', credit: 'זכות', balance: 'יתרה',
  chargeDate: 'תאריך חיוב', cardNumber: 'מספר כרטיס', ignore: 'התעלם',
}

interface Props {
  tenantId: string
  userId: string | null
  sources: BankSource[]
  onSourcesChange: () => void
  onImported: (importId: string) => void
}

export default function ImportWizard({ tenantId, userId, sources, onSourcesChange, onImported }: Props) {
  const supabase = useRef(createClient()).current
  const { showToast } = useToast()

  const [step, setStep] = useState<'upload' | 'map' | 'confirm'>('upload')
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState<unknown[][]>([])

  const [sourceId, setSourceId] = useState<string>('') // '' = new source
  const [sourceName, setSourceName] = useState('')
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [amountMode, setAmountMode] = useState<AmountMode>('single')
  const [amountSign, setAmountSign] = useState<AmountSign>('positive_is_debit')
  const [roleByCol, setRoleByCol] = useState<Record<number, Role>>({})

  const [parsed, setParsed] = useState<ParsedLine[]>([])
  const [dupKeys, setDupKeys] = useState<Set<string>>(new Set())
  const [skipDup, setSkipDup] = useState<Set<number>>(new Set()) // rowIndex values to skip
  const [busy, setBusy] = useState(false)

  const colCount = useMemo(() => Math.max(0, ...rawRows.slice(0, 20).map(r => (r?.length ?? 0))), [rawRows])
  const previewRows = rawRows.slice(0, 15)

  function applyMappingObj(mapping: ColumnMapping) {
    setHeaderRowIndex(mapping.headerRowIndex)
    setAmountMode(mapping.amountMode)
    setAmountSign(mapping.columns.amountSign ?? 'positive_is_debit')
    const roles: Record<number, Role> = {}
    if (mapping.columns.date != null) roles[mapping.columns.date] = 'date'
    if (mapping.columns.description != null) roles[mapping.columns.description] = 'description'
    if (mapping.columns.amount != null) roles[mapping.columns.amount] = 'amount'
    if (mapping.columns.debit != null) roles[mapping.columns.debit] = 'debit'
    if (mapping.columns.credit != null) roles[mapping.columns.credit] = 'credit'
    if (mapping.columns.balance != null) roles[mapping.columns.balance] = 'balance'
    if (mapping.columns.chargeDate != null) roles[mapping.columns.chargeDate] = 'chargeDate'
    if (mapping.columns.cardNumber != null) roles[mapping.columns.cardNumber] = 'cardNumber'
    setRoleByCol(roles)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFileName(file.name)
    const rows = await readRawRows(file)
    setRawRows(rows)
    const guess = guessMapping(rows)
    applyMappingObj(guess)
    setSourceId('')
    setSourceName('')
    setStep('map')
  }

  function pickSource(id: string) {
    setSourceId(id)
    if (!id) { setSourceName(''); applyMappingObj(guessMapping(rawRows)); return }
    const src = sources.find(s => s.id === id)
    if (src) { setSourceName(src.name); applyMappingObj(src.column_mapping) }
  }

  function buildMapping(): ColumnMapping | null {
    const dateCol = Object.entries(roleByCol).find(([, r]) => r === 'date')?.[0]
    const descCol = Object.entries(roleByCol).find(([, r]) => r === 'description')?.[0]
    if (dateCol == null || descCol == null) return null

    const chargeDateCol = Object.entries(roleByCol).find(([, r]) => r === 'chargeDate')?.[0]
    const cardNumberCol = Object.entries(roleByCol).find(([, r]) => r === 'cardNumber')?.[0]
    const extra = {
      chargeDate: chargeDateCol != null ? Number(chargeDateCol) : undefined,
      cardNumber: cardNumberCol != null ? Number(cardNumberCol) : undefined,
    }

    if (amountMode === 'single') {
      const amtCol = Object.entries(roleByCol).find(([, r]) => r === 'amount')?.[0]
      if (amtCol == null) return null
      const balCol = Object.entries(roleByCol).find(([, r]) => r === 'balance')?.[0]
      return {
        headerRowIndex, amountMode: 'single',
        columns: {
          date: Number(dateCol), description: Number(descCol),
          amount: Number(amtCol), amountSign,
          balance: balCol != null ? Number(balCol) : undefined,
          ...extra,
        },
      }
    }
    const debitCol  = Object.entries(roleByCol).find(([, r]) => r === 'debit')?.[0]
    const creditCol = Object.entries(roleByCol).find(([, r]) => r === 'credit')?.[0]
    if (debitCol == null || creditCol == null) return null
    const balCol = Object.entries(roleByCol).find(([, r]) => r === 'balance')?.[0]
    return {
      headerRowIndex, amountMode: 'debit_credit',
      columns: {
        date: Number(dateCol), description: Number(descCol),
        debit: Number(debitCol), credit: Number(creditCol),
        balance: balCol != null ? Number(balCol) : undefined,
        ...extra,
      },
    }
  }

  async function saveMappingAndParse() {
    const mapping = buildMapping()
    if (!mapping) { showToast('נא לסמן עמודות תאריך, תיאור וסכום', 'error'); return }
    if (!sourceName.trim()) { showToast('נא לתת שם למקור (לדוגמה: בנק הפועלים עו״ש)', 'error'); return }

    setBusy(true)
    const { data: src, error } = await supabase.from('bank_statement_sources')
      .upsert({ tenant_id: tenantId, name: sourceName.trim(), column_mapping: mapping }, { onConflict: 'tenant_id,name' })
      .select('*').single()
    setBusy(false)
    if (error || !src) { showToast('שגיאה בשמירת המקור: ' + (error?.message ?? ''), 'error'); return }

    setSourceId(src.id)
    onSourcesChange()

    const lines = applyMapping(rawRows, mapping)
    setParsed(lines)

    // Duplicate detection against prior imports from the same source
    if (lines.length > 0) {
      const dates = lines.map(l => l.date).sort()
      const { data: existing } = await supabase.from('bank_statement_lines')
        .select('date, amount')
        .eq('tenant_id', tenantId).eq('source_id', src.id)
        .gte('date', dates[0]).lte('date', dates[dates.length - 1])
      const keys = new Set((existing ?? []).map((r: any) => `${r.date}|${Number(r.amount)}`))
      setDupKeys(keys)
      setSkipDup(new Set(lines.filter(l => keys.has(`${l.date}|${l.amount}`)).map(l => l.rowIndex)))
    } else {
      setDupKeys(new Set())
      setSkipDup(new Set())
    }

    setStep('confirm')
  }

  async function confirmImport() {
    const toInsert = parsed.filter(l => !skipDup.has(l.rowIndex))
    if (toInsert.length === 0) { showToast('אין שורות לייבוא', 'error'); return }

    setBusy(true)
    const { data: imp, error: impErr } = await supabase.from('bank_statement_imports').insert({
      tenant_id: tenantId, source_id: sourceId, file_name: fileName,
      row_count: rawRows.length, imported_count: toInsert.length, imported_by: userId,
    }).select('id').single()

    if (impErr || !imp) { setBusy(false); showToast('שגיאה: ' + (impErr?.message ?? ''), 'error'); return }

    const { error: linesErr } = await supabase.from('bank_statement_lines').insert(
      toInsert.map(l => ({
        tenant_id: tenantId, import_id: imp.id, source_id: sourceId,
        row_index: l.rowIndex, date: l.date, description: l.description,
        direction: l.direction, amount: l.amount, balance_after: l.balanceAfter,
        charge_date: l.chargeDate, card_number: l.cardNumber,
        raw_row: l.raw,
      }))
    )
    setBusy(false)
    if (linesErr) { showToast('שגיאה בייבוא השורות: ' + linesErr.message, 'error'); return }

    showToast(`יובאו ${toInsert.length} שורות${skipDup.size ? `, ${skipDup.size} דולגו ככפולות` : ''} ✓`, 'success')
    onImported(imp.id)
    // Reset for a possible next import
    setStep('upload'); setRawRows([]); setParsed([]); setFileName('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {step === 'upload' && (
        <div style={{
          border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '40px 20px',
          textAlign: 'center', background: 'var(--bg-card)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>📄</div>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            העלה קובץ דף בנק / כרטיס אשראי (Excel או CSV)
          </div>
          <label style={{ display: 'inline-block' }}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
            <span style={{
              display: 'inline-block', padding: '9px 18px', borderRadius: '9px',
              background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            }}>בחר קובץ</span>
          </label>
        </div>
      )}

      {step === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>מקור</label>
              <select value={sourceId} onChange={e => pickSource(e.target.value)} style={{ ...SEL, minWidth: 200 }}>
                <option value="">+ מקור חדש</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Input label="שם המקור" placeholder="לדוגמה: בנק הפועלים עו״ש" value={sourceName} onChange={e => setSourceName(e.target.value)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>שורת הכותרות (0 = הראשונה)</label>
              <input type="number" min={0} value={headerRowIndex} onChange={e => setHeaderRowIndex(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ ...SEL, width: 90 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>סוג עמודת סכום</label>
              <select value={amountMode} onChange={e => setAmountMode(e.target.value as AmountMode)} style={SEL}>
                <option value="single">עמודת סכום אחת</option>
                <option value="debit_credit">חובה + זכות בנפרד</option>
              </select>
            </div>
            {amountMode === 'single' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>משמעות סכום חיובי</label>
                <select value={amountSign} onChange={e => setAmountSign(e.target.value as AmountSign)} style={SEL}>
                  <option value="positive_is_debit">חיובי = הוצאה (חובה)</option>
                  <option value="positive_is_credit">חיובי = הכנסה (זכות)</option>
                </select>
              </div>
            )}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            לכל עמודה בטבלה למטה בחר תפקיד (תאריך / תיאור / סכום / התעלם וכו׳) — תצוגה מקדימה של {previewRows.length} השורות הראשונות מהקובץ.
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  {Array.from({ length: colCount }).map((_, c) => (
                    <th key={c} style={{ padding: '6px', borderBottom: '1px solid var(--border)', background: '#f8fafc', minWidth: 110 }}>
                      <select
                        value={roleByCol[c] ?? 'ignore'}
                        onChange={e => setRoleByCol(prev => ({ ...prev, [c]: e.target.value as Role }))}
                        style={{ ...SEL, padding: '4px 6px', fontSize: '11px', width: '100%' }}
                      >
                        {(Object.keys(ROLE_LABELS) as Role[])
                          .filter(r => amountMode === 'single' ? r !== 'debit' && r !== 'credit' : r !== 'amount')
                          .map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri === headerRowIndex ? '#fef9c3' : ri % 2 ? '#fafafa' : '#fff' }}>
                    {Array.from({ length: colCount }).map((_, c) => (
                      <td key={c} style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                        {row?.[c] instanceof Date ? (row[c] as Date).toLocaleDateString('he-IL') : String(row?.[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStep('upload')}>← חזרה</Button>
            <Button onClick={saveMappingAndParse} loading={busy}>💾 שמור מיפוי והמשך</Button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px' }}>
            נמצאו <b>{parsed.length}</b> שורות תקינות בקובץ.
            {dupKeys.size > 0 && <span style={{ color: 'var(--warning)' }}> {skipDup.size} מסומנות כספק כפילות (מיובא כבר ממקור זה) — לא יסומנו יבוטלו מהייבוא.</span>}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '6px 8px' }}></th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>תאריך עסקה</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>תיאור</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>כיוון</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>סכום</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>תאריך חיוב</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>כרטיס</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map(l => {
                  const isDup = dupKeys.has(`${l.date}|${l.amount}`)
                  const skip = skipDup.has(l.rowIndex)
                  return (
                    <tr key={l.rowIndex} style={{ borderTop: '1px solid #f1f5f9', opacity: skip ? 0.5 : 1 }}>
                      <td style={{ padding: '5px 8px' }}>
                        {isDup && (
                          <input type="checkbox" checked={!skip} onChange={e => setSkipDup(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.delete(l.rowIndex); else next.add(l.rowIndex)
                            return next
                          })} title="ייבא בכל זאת (כרגע מסומן כדילוג ככפילות)" />
                        )}
                      </td>
                      <td style={{ padding: '5px 8px' }}>{l.date}</td>
                      <td style={{ padding: '5px 8px' }}>{l.description}</td>
                      <td style={{ padding: '5px 8px' }}>{l.direction === 'debit' ? 'חובה' : 'זכות'}</td>
                      <td style={{ padding: '5px 8px' }}>₪{l.amount.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '5px 8px' }}>{l.chargeDate ?? '—'}</td>
                      <td style={{ padding: '5px 8px' }}>{l.cardNumber ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setStep('map')}>← חזרה למיפוי</Button>
            <Button onClick={confirmImport} loading={busy}>✓ ייבוא {parsed.length - skipDup.size} שורות</Button>
          </div>
        </div>
      )}
    </div>
  )
}
