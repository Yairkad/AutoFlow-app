'use client'

import { useState, type ReactNode } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type { DupGroup } from '@/lib/stock/duplicates'

export interface DupColumn<T> { label: string; render: (t: T) => ReactNode }

interface Props<T extends { id: string }> {
  open: boolean
  onClose: () => void
  title: string
  groups: DupGroup<T>[]
  columns: DupColumn<T>[]
  /** Default record to keep in a group */
  keeperOf: (items: T[]) => T
  /** Merge sources into target; resolves when done (caller reloads) */
  onMerge: (targetId: string, sourceIds: string[]) => Promise<boolean>
}

// Lists groups of probable duplicates side by side. The user picks which record stays
// (default: the one with a price) and merges the rest into it — stock and history move over.
export default function DuplicatesModal<T extends { id: string }>({ open, onClose, title, groups, columns, keeperOf, onMerge }: Props<T>) {
  const [keep, setKeep] = useState<Record<string, string>>({})   // group key → kept id
  const [skip, setSkip] = useState<Set<string>>(new Set())        // ids left out of their group's merge
  const toggleSkip = (id: string) => setSkip(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const [busy, setBusy] = useState<string | null>(null)

  return (
    <Modal open={open} onClose={onClose} title={`${title} (${groups.length})`} maxWidth={980}>
      {groups.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>✓ לא נמצאו כפילויות</p>
      ) : (
        <>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            בכל קבוצה סמן איזו רשומה להשאיר (ברירת מחדל: זו עם מחיר), ובטל את הסימון &quot;למזג&quot; ברשומות שאינן באמת אותו פריט.
            במיזוג — הכמות, התנועות, הברקודים והפרטים החסרים עוברים לרשומה שנשארת, והמסומנות נמחקות.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {groups.map(g => {
              const gKey   = g.items.map(i => i.id).sort().join(',')
              const keepId = keep[gKey] ?? keeperOf(g.items).id
              const sources = g.items.filter(i => i.id !== keepId && !skip.has(i.id)).map(i => i.id)
              return (
                <section key={gKey} aria-label={`קבוצת כפילויות: ${g.reasons.join(', ')}`}
                  style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>⚠ {g.reasons.join(' · ')} — {g.items.length} רשומות</span>
                    <Button size="sm" disabled={busy !== null || sources.length === 0}
                      onClick={async () => {
                        setBusy(gKey)
                        await onMerge(keepId, sources)
                        setBusy(null)
                      }}>
                      {busy === gKey ? 'ממזג...' : sources.length === 0 ? 'לא נבחר מה למזג' : `מזג ${sources.length} לרשומה שנשארת`}
                    </Button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th scope="col" style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>להשאיר</th>
                          <th scope="col" style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>למזג</th>
                          {columns.map(c => (
                            <th key={c.label} scope="col" style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map(it => (
                          <tr key={it.id} style={{ borderTop: '1px solid var(--border)', background: it.id === keepId ? 'var(--success-soft)' : undefined, opacity: it.id !== keepId && skip.has(it.id) ? 0.5 : 1 }}>
                            <td style={{ padding: '6px 10px' }}>
                              <input type="radio" name={`keep-${gKey}`} checked={it.id === keepId}
                                aria-label="השאר רשומה זו"
                                onChange={() => setKeep(k => ({ ...k, [gKey]: it.id }))} />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              {it.id !== keepId && (
                                <input type="checkbox" checked={!skip.has(it.id)} aria-label="למזג רשומה זו"
                                  onChange={() => toggleSkip(it.id)} />
                              )}
                            </td>
                            {columns.map(c => <td key={c.label} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{c.render(it)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
