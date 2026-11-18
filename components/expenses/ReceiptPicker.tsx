'use client'

// Two ways to get a receipt file: the in-app camera scanner, or an existing file (photo / PDF).
import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'

export default function ReceiptPicker({ onFile, disabled, label = 'קבלה' }: { onFile: (f: File) => void; disabled?: boolean; label?: string }) {
  const [scan, setScan] = useState(false)
  const inputId = useId()
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setScan(true)}>📷 סריקת {label}</Button>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => document.getElementById(inputId)?.click()}>📎 קובץ</Button>
        <input id={inputId} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} />
      </div>
      {scan && <DocumentScannerModal onComplete={f => { setScan(false); onFile(f) }} onClose={() => setScan(false)} />}
    </>
  )
}
