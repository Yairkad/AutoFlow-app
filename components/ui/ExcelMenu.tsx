'use client'

import { useRef, useState, useEffect } from 'react'

interface ExcelMenuProps {
  onExportExcel: () => void
  onImportExcel?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

/**
 * Single dropdown button for Excel export/import.
 * Works identically on mobile and desktop – one "📊 ▾" button.
 */
export default function ExcelMenu({
  onExportExcel,
  onImportExcel,
}: ExcelMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)

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

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button style={triggerSt} onClick={() => setOpen(v => !v)}>
        📊 Excel ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          minWidth: '160px', zIndex: 200, overflow: 'hidden',
        }}>
          <button style={itemSt} onClick={() => { onExportExcel(); setOpen(false) }}>
            📤 ייצא Excel
          </button>
          {onImportExcel && (
            <label style={{ ...itemSt, cursor: 'pointer' }}>
              📥 ייבא Excel
              <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                onChange={e => { onImportExcel(e); setOpen(false) }} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}
