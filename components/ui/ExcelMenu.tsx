'use client'

import { useRef, useState, useEffect } from 'react'

interface ExcelMenuProps {
  onExportExcel: () => void
  onExportJson:  () => void
  onImportExcel?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onImportJson?:  (e: React.ChangeEvent<HTMLInputElement>) => void
}

/**
 * Single dropdown button for export/import in both Excel and JSON formats.
 * Works identically on mobile and desktop – one "📊 ▾" button.
 */
export default function ExcelMenu({
  onExportExcel,
  onExportJson,
  onImportExcel,
  onImportJson,
}: ExcelMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const triggerSt: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', borderRadius: '8px',
    border: '1px solid var(--border)', fontSize: '13px',
    cursor: 'pointer', background: 'var(--bg-card)',
    color: 'var(--text)', fontWeight: 500, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  }

  const itemSt: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    width: '100%', padding: '9px 14px',
    border: 'none', background: 'none',
    cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '13px', color: 'var(--text)',
    textAlign: 'right', whiteSpace: 'nowrap',
  }

  const hasImport = onImportExcel || onImportJson

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button style={triggerSt} onClick={() => setOpen(v => !v)}>
        📊 ייצוא / ייבוא ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          minWidth: '170px', zIndex: 200, overflow: 'hidden',
        }}>

          {/* ── Export ──────────────────────────────────────── */}
          <div style={{ padding: '6px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            ייצוא
          </div>
          <button style={itemSt} onClick={() => { onExportExcel(); setOpen(false) }}>
            📊 Excel (.xlsx)
          </button>
          <button style={itemSt} onClick={() => { onExportJson(); setOpen(false) }}>
            📋 JSON (.json)
          </button>

          {/* ── Import ──────────────────────────────────────── */}
          {hasImport && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div style={{ padding: '4px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                ייבוא
              </div>
              {onImportExcel && (
                <label style={{ ...itemSt, cursor: 'pointer' }}>
                  📥 Excel (.xlsx)
                  <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                    onChange={e => { onImportExcel(e); setOpen(false) }} />
                </label>
              )}
              {onImportJson && (
                <label style={{ ...itemSt, cursor: 'pointer' }}>
                  📋 JSON (.json)
                  <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={e => { onImportJson(e); setOpen(false) }} />
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
