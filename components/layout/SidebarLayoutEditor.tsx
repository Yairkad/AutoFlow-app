'use client'

import { useEffect, useState } from 'react'
import { saveUiSettings } from '@/lib/uiSettings'

export type SectionConfig = { label: string | null; hrefs: string[] }
export const SIDEBAR_LAYOUT_KEY = 'autoflow-sidebar-layout'

type ItemMeta = { href: string; label: string; color: string }

type Props = {
  open: boolean
  onClose: () => void
  defaultSections: SectionConfig[]
  allItems: ItemMeta[]
  tenantId: string | null
  onSave: (sections: SectionConfig[]) => void
}

export default function SidebarLayoutEditor({ open, onClose, defaultSections, allItems, tenantId, onSave }: Props) {
  const [sections, setSections] = useState<SectionConfig[]>([])

  useEffect(() => {
    if (open) setSections(defaultSections.map(s => ({ ...s, hrefs: [...s.hrefs] })))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const itemByHref = Object.fromEntries(allItems.map(i => [i.href, i]))

  /* ── helpers ── */
  function clone() { return sections.map(s => ({ ...s, hrefs: [...s.hrefs] })) }

  function moveItemUp(si: number, ii: number) {
    if (ii === 0) return
    const next = clone()
    ;[next[si].hrefs[ii - 1], next[si].hrefs[ii]] = [next[si].hrefs[ii], next[si].hrefs[ii - 1]]
    setSections(next)
  }
  function moveItemDown(si: number, ii: number) {
    const next = clone()
    if (ii === next[si].hrefs.length - 1) return
    ;[next[si].hrefs[ii], next[si].hrefs[ii + 1]] = [next[si].hrefs[ii + 1], next[si].hrefs[ii]]
    setSections(next)
  }
  function moveItemToSection(href: string, fromSi: number, toSi: number) {
    const next = clone()
    next[fromSi].hrefs = next[fromSi].hrefs.filter(h => h !== href)
    next[toSi].hrefs.push(href)
    setSections(next)
  }
  function renameSection(si: number, val: string) {
    const next = clone()
    next[si].label = val || null
    setSections(next)
  }
  function moveSectionUp(si: number) {
    if (si === 0) return
    const next = clone()
    ;[next[si - 1], next[si]] = [next[si], next[si - 1]]
    setSections(next)
  }
  function moveSectionDown(si: number) {
    const next = clone()
    if (si === next.length - 1) return
    ;[next[si], next[si + 1]] = [next[si + 1], next[si]]
    setSections(next)
  }
  function addSection() {
    setSections([...clone(), { label: 'קטגוריה חדשה', hrefs: [] }])
  }
  function deleteSection(si: number) {
    const next = clone()
    const orphans = next[si].hrefs
    next.splice(si, 1)
    if (next.length > 0) next[0].hrefs = [...orphans, ...next[0].hrefs]
    setSections(next)
  }

  function save() {
    localStorage.setItem(SIDEBAR_LAYOUT_KEY, JSON.stringify(sections))
    if (tenantId) saveUiSettings(tenantId, { sidebar_layout: sections })
    onSave(sections)
    onClose()
  }
  function reset() {
    localStorage.removeItem(SIDEBAR_LAYOUT_KEY)
    if (tenantId) saveUiSettings(tenantId, { sidebar_layout: undefined })
    onSave(defaultSections)
    onClose()
  }

  /* ── styles ── */
  const S = {
    overlay: {
      position: 'fixed' as const, inset: 0,
      background: '#00000044', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    modal: {
      background: '#fff', borderRadius: '16px',
      width: '520px', maxWidth: '95vw',
      maxHeight: '85vh', display: 'flex', flexDirection: 'column' as const,
      boxShadow: '0 20px 60px #00000030',
      overflow: 'hidden',
    },
    header: {
      padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    body: { overflowY: 'auto' as const, flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column' as const, gap: '10px' },
    footer: { padding: '12px 20px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: '8px', justifyContent: 'flex-start' },
    sectionCard: { border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' },
    sectionHead: {
      background: '#f9fafb', padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #e5e7eb',
    },
    sectionInput: {
      flex: 1, border: 'none', background: 'transparent', fontSize: '12px',
      fontWeight: 600, color: '#374151', outline: 'none', minWidth: 0,
    },
    sectionBody: { padding: '4px 0' },
    row: {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 10px', fontSize: '13px', color: '#374151',
    },
    iconBubble: (color: string) => {
      const [from, to] = color.split(',')
      return {
        width: 24, height: 24, borderRadius: '6px', flexShrink: 0,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }
    },
    iconBtn: {
      width: 22, height: 22, border: '1px solid #e5e7eb', borderRadius: '5px',
      background: '#fff', cursor: 'pointer', fontSize: '10px', color: '#6b7280',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      padding: 0,
    } as React.CSSProperties,
    select: {
      fontSize: '11px', border: '1px solid #e5e7eb', borderRadius: '5px',
      padding: '2px 4px', color: '#6b7280', background: '#fff', cursor: 'pointer',
      marginRight: 'auto',
    },
    btnPrimary: {
      padding: '8px 20px', background: 'var(--primary)', color: '#fff',
      border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    },
    btnGhost: {
      padding: '8px 16px', background: 'transparent', color: '#6b7280',
      border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
    },
    btnDanger: {
      padding: '8px 16px', background: 'transparent', color: '#ef4444',
      border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
    },
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>סידור תפריט צד</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>גרור קטגוריות, שנה שמות, הזז פריטים</div>
          </div>
          <button style={{ ...S.iconBtn, width: 28, height: 28, fontSize: '14px' }} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={S.body}>
          {sections.map((sec, si) => (
            <div key={si} style={S.sectionCard}>

              {/* Section header */}
              <div style={S.sectionHead}>
                <input
                  style={S.sectionInput}
                  value={sec.label ?? ''}
                  placeholder="(ללא כותרת)"
                  onChange={e => renameSection(si, e.target.value)}
                />
                <button style={S.iconBtn} onClick={() => moveSectionUp(si)} title="העלה קטגוריה">↑</button>
                <button style={S.iconBtn} onClick={() => moveSectionDown(si)} title="הורד קטגוריה">↓</button>
                <button
                  style={{ ...S.iconBtn, color: '#ef4444', borderColor: '#fca5a5' }}
                  onClick={() => deleteSection(si)}
                  title="מחק קטגוריה"
                >✕</button>
              </div>

              {/* Items */}
              <div style={S.sectionBody}>
                {sec.hrefs.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: '12px', color: '#d1d5db', fontStyle: 'italic' }}>
                    אין פריטים — הזז פריטים לכאן
                  </div>
                )}
                {sec.hrefs.map((href, ii) => {
                  const item = itemByHref[href]
                  if (!item) return null
                  return (
                    <div key={href} style={S.row}>
                      <div style={S.iconBubble(item.color)}>
                        <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          {/* small colored dot */}
                        </svg>
                      </div>
                      <span style={{ flex: 1 }}>{item.label}</span>

                      {/* Move to section */}
                      <select
                        style={S.select}
                        value={si}
                        onChange={e => moveItemToSection(href, si, Number(e.target.value))}
                      >
                        {sections.map((s, idx) => (
                          <option key={idx} value={idx}>{s.label || '(ללא כותרת)'}</option>
                        ))}
                      </select>

                      <button style={S.iconBtn} onClick={() => moveItemUp(si, ii)} title="העלה">↑</button>
                      <button style={S.iconBtn} onClick={() => moveItemDown(si, ii)} title="הורד">↓</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Add section */}
          <button
            style={{ ...S.btnGhost, fontSize: '12px', padding: '7px 14px', alignSelf: 'flex-start' }}
            onClick={addSection}
          >
            + הוסף קטגוריה
          </button>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.btnPrimary} onClick={save}>שמור</button>
          <button style={S.btnGhost} onClick={onClose}>ביטול</button>
          <button style={{ ...S.btnDanger, marginRight: 'auto' }} onClick={reset}>איפוס לברירת מחדל</button>
        </div>

      </div>
    </div>
  )
}
