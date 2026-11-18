'use client'

// Three ways to get a receipt file: the office scanner (AutoFlow scanner agent, same as supplier
// invoices), the in-app camera scanner, or an existing file (photo / PDF).
import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import DocumentScannerModal from '@/components/ui/DocumentScannerModal'
import {
  scanWithAgent, listScanners, getSavedScanner, saveScanner, ScannerAgentMissingError, ScannerAgentOutdatedError,
  ScannerDeviceNotFoundError, SCANNER_DOWNLOAD_URL, type ScannerDevice,
} from '@/lib/scannerAgent'

export default function ReceiptPicker({ onFile, disabled, label = 'קבלה' }: { onFile: (f: File) => void; disabled?: boolean; label?: string }) {
  const { showToast } = useToast()
  const [camera, setCamera] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [agentMissing, setAgentMissing] = useState(false)
  const [picker, setPicker] = useState<{ devices: ScannerDevice[]; scanAfter: boolean } | null>(null)
  const inputId = useId()

  const agentError = (e: unknown) => {
    if (e instanceof ScannerAgentMissingError || e instanceof ScannerAgentOutdatedError) setAgentMissing(true)
    if (e instanceof ScannerDeviceNotFoundError) saveScanner(null)
    showToast(e instanceof Error ? e.message : 'שגיאת סריקה', 'error')
  }

  async function scanWith(deviceId: string) {
    setScanning(true)
    try { onFile(await scanWithAgent(deviceId, `receipt_${Date.now()}.pdf`)) }
    catch (e) { agentError(e) }
    finally { setScanning(false) }
  }

  // scanAfter=false → only choose / replace the scanner
  async function choose(scanAfter: boolean) {
    try {
      const devices = await listScanners()
      if (!devices.length) { showToast('לא נמצא סורק מחובר למחשב. ודאו שהסורק דולק ומחובר', 'error'); return }
      if (devices.length === 1) {
        saveScanner(devices[0].id)
        if (scanAfter) await scanWith(devices[0].id); else showToast(`נמצא סורק אחד: ${devices[0].name}`, 'success')
        return
      }
      setPicker({ devices, scanAfter })
    } catch (e) { agentError(e) }
  }

  async function scan() {
    const saved = getSavedScanner()
    if (saved) await scanWith(saved); else await choose(true)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="sm" variant="secondary" disabled={disabled || scanning} loading={scanning} onClick={scan}>🖨 סריקת {label}</Button>
        <Button size="sm" variant="secondary" disabled={disabled || scanning} onClick={() => setCamera(true)}>📷 צילום</Button>
        <Button size="sm" variant="secondary" disabled={disabled || scanning} onClick={() => document.getElementById(inputId)?.click()}>📎 קובץ</Button>
        <input id={inputId} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} />
        {!agentMissing && getSavedScanner() && (
          <button type="button" onClick={() => choose(false)} style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            החלף סורק
          </button>
        )}
        {agentMissing && (
          <a href={SCANNER_DOWNLOAD_URL} download style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>⬇ התקנת סורק למחשב</a>
        )}
      </div>

      {camera && <DocumentScannerModal onComplete={f => { setCamera(false); onFile(f) }} onClose={() => setCamera(false)} />}

      {picker && (
        <div onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="בחירת סורק" style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 18, width: 'min(420px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,.25)', direction: 'rtl' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>מאיזה סורק לסרוק?</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>הבחירה תישמר במחשב הזה.</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {picker.devices.map(d => (
                <button key={d.id} type="button" onClick={() => { const after = picker.scanAfter; saveScanner(d.id); setPicker(null); if (after) scanWith(d.id); else showToast(`נבחר הסורק: ${d.name}`, 'success') }}
                  style={{ textAlign: 'start', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                  {d.name}{getSavedScanner() === d.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button type="button" onClick={() => setPicker(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
