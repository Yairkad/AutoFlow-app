'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'

interface TireRow {
  id: string
  sku: string | null
  brand: string | null
  width: number
  profile: number
  rim: number
  qty: number
}

interface ScanEntry {
  sku: string
  tireId: string | null
  label: string
  scanned: number
}

function tireSize(t: TireRow) { return `${t.width}/${t.profile}R${t.rim}` }
function tireLabel(t: TireRow) { return [t.brand, tireSize(t)].filter(Boolean).join(' ') }

export default function InventoryCountClient() {
  const router  = useRouter()
  const sb      = useRef(createClient()).current
  const { showToast } = useToast()
  const tenantId = useRef('')

  const [tires,   setTires]   = useState<TireRow[]>([])
  const [loading, setLoading] = useState(true)
  const [phase,   setPhase]   = useState<'scan' | 'review'>('scan')
  const [query,   setQuery]   = useState('')
  const [entries, setEntries] = useState<ScanEntry[]>([])
  const [saving,  setSaving]  = useState(false)

  const [scanMode,   setScanMode]   = useState(false)
  const [scanBuffer, setScanBuffer] = useState('')
  const scanRef  = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile) { setLoading(false); return }
      tenantId.current = profile.tenant_id
      const { data: ts } = await sb.from('tires')
        .select('id, sku, brand, width, profile, rim, qty')
        .eq('tenant_id', profile.tenant_id)
      setTires(ts ?? [])
      setLoading(false)
    })()
  }, [sb])

  const skuMap = useMemo(() => {
    const m = new Map<string, TireRow>()
    tires.forEach(t => { if (t.sku) m.set(t.sku.toLowerCase().trim(), t) })
    return m
  }, [tires])

  useEffect(() => {
    if (!scanMode) return
    scanRef.current?.focus()
    setScanBuffer('')
  }, [scanMode])

  function addScan(rawSku: string) {
    const sku = rawSku.trim()
    if (!sku) return
    const tire = skuMap.get(sku.toLowerCase()) ?? null
    setEntries(prev => {
      const idx = prev.findIndex(e => e.sku.toLowerCase() === sku.toLowerCase())
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], scanned: next[idx].scanned + 1 }
        return next
      }
      return [{ sku, tireId: tire?.id ?? null, label: tire ? tireLabel(tire) : '⚠ לא מזוהה', scanned: 1 }, ...prev]
    })
    setQuery('')
    queryRef.current?.focus()
  }

  async function confirmUpdate() {
    const toUpdate = entries.filter(e => e.tireId !== null)
    if (toUpdate.length === 0) { showToast('אין פריטים לעדכון', 'error'); return }
    setSaving(true)
    await Promise.all(toUpdate.map(e => sb.from('tires').update({ qty: e.scanned }).eq('id', e.tireId!)))
    showToast(`עודכנו ${toUpdate.length} צמיגים ✓`, 'success')
    setSaving(false)
    router.push('/tires')
  }

  const known   = entries.filter(e => e.tireId)
  const unknown = entries.filter(e => !e.tireId)
  const diffCount = known.filter(e => {
    const t = tires.find(x => x.id === e.tireId)
    return t && t.qty !== e.scanned
  }).length

  const tabBtn = (p: 'scan' | 'review', label: string) => (
    <button onClick={() => setPhase(p)} style={{
      padding: '7px 20px', border: 'none', borderRadius: '7px', cursor: 'pointer',
      fontWeight: phase === p ? 700 : 400, fontSize: '13px',
      background: phase === p ? '#fff' : 'transparent',
      color: phase === p ? 'var(--text)' : 'var(--text-muted)',
      boxShadow: phase === p ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
      fontFamily: 'inherit', whiteSpace: 'nowrap',
    }}>{label}</button>
  )

  if (loading) return (
    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>טוען...</div>
  )

  return (
    <div style={{ direction: 'rtl', maxWidth: '820px', margin: '0 auto', padding: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0 }}>📦 ספירת מלאי</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
            סרוק ברקוד / הקלד מקט — המערכת תספור ותעדכן כמויות
          </p>
        </div>
        <button onClick={() => router.push('/tires')} style={{
          padding: '8px 16px', border: '1px solid var(--border)', borderRadius: '8px',
          background: 'var(--bg)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
        }}>← חזור לצמיגים</button>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'inline-flex', gap: '4px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', marginBottom: '20px' }}>
        {tabBtn('scan',   `📡 סריקה${entries.length ? ` (${entries.length})` : ''}`)}
        {tabBtn('review', `📋 סיכום${known.length ? ` (${known.length})` : ''}`)}
      </div>

      {/* ── SCAN PHASE ── */}
      {phase === 'scan' && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <input
              ref={queryRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addScan(query) }}
              placeholder="הקלד מקט / סרוק ברקוד ולחץ Enter..."
              autoFocus
              style={{
                flex: 1, padding: '12px 16px', border: '2px solid var(--accent)',
                borderRadius: '12px', fontSize: '16px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={() => addScan(query)} style={{
              padding: '0 20px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px',
              cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
            }}>הוסף</button>
            <button onClick={() => setScanMode(m => !m)} style={{
              width: '50px', height: '50px', borderRadius: '12px', border: 'none',
              background: scanMode ? '#2563eb' : '#1e293b', color: '#fff',
              cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 28 22" width="22" height="17" fill="white">
                <rect x="0"  y="0" width="2" height="22"/><rect x="4"  y="0" width="1" height="22"/>
                <rect x="7"  y="0" width="3" height="22"/><rect x="12" y="0" width="1" height="22"/>
                <rect x="15" y="0" width="2" height="22"/><rect x="19" y="0" width="1" height="22"/>
                <rect x="22" y="0" width="3" height="22"/><rect x="27" y="0" width="1" height="22"/>
              </svg>
            </button>
          </div>

          {/* Hidden scanner input */}
          <input
            ref={scanRef}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            value={scanBuffer}
            onChange={e => setScanBuffer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && scanBuffer) { addScan(scanBuffer); setScanBuffer('') } }}
          />

          {scanMode && (
            <div style={{
              background: '#2563eb', color: '#fff', borderRadius: '12px',
              padding: '12px 16px', marginBottom: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 600 }}>📡 ממתין לסריקה...</span>
              <button onClick={() => setScanMode(false)} style={{
                background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)',
                color: '#fff', borderRadius: '8px', padding: '4px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
              }}>ביטול</button>
            </div>
          )}

          {entries.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px', color: 'var(--text-muted)',
              border: '2px dashed var(--border)', borderRadius: '12px',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📡</div>
              <div style={{ fontWeight: 600 }}>סרוק ברקוד צמיג להתחיל</div>
              <div style={{ fontSize: '12px', marginTop: '6px' }}>כל סריקה מוסיפה יחידה אחת לספירה</div>
            </div>
          ) : (
            <>
              <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>פריטים שנסרקו ({entries.length})</span>
                  <button onClick={() => setEntries([])} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>נקה הכל</button>
                </div>
                {entries.map(e => (
                  <div key={e.sku} style={{
                    display: 'flex', alignItems: 'center', padding: '10px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: e.tireId ? 'var(--bg-card)' : '#fff7ed',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: e.tireId ? 'var(--text)' : '#92400e' }}>{e.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{e.sku}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => setEntries(p => p.map(x => x.sku === e.sku ? { ...x, scanned: Math.max(0, x.scanned - 1) } : x).filter(x => x.scanned > 0))}
                        style={{ width: '30px', height: '30px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', cursor: 'pointer', fontWeight: 700, fontSize: '16px', fontFamily: 'inherit' }}>−</button>
                      <span style={{ fontWeight: 900, fontSize: '18px', minWidth: '32px', textAlign: 'center' }}>{e.scanned}</span>
                      <button onClick={() => setEntries(p => p.map(x => x.sku === e.sku ? { ...x, scanned: x.scanned + 1 } : x))}
                        style={{ width: '30px', height: '30px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', cursor: 'pointer', fontWeight: 700, fontSize: '16px', fontFamily: 'inherit' }}>+</button>
                      <button onClick={() => setEntries(p => p.filter(x => x.sku !== e.sku))}
                        style={{ marginRight: '4px', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button variant="secondary" onClick={() => setEntries([])}>נקה הכל</Button>
                <Button onClick={() => setPhase('review')}>
                  סיים ועבור לסיכום ({entries.length} פריטים) →
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* ── REVIEW PHASE ── */}
      {phase === 'review' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'סוגים שזוהו',    value: known.length,   color: 'var(--accent)',  bg: 'var(--bg-card)', border: 'var(--border)' },
              { label: 'שינויים בכמות',  value: diffCount,      color: diffCount > 0 ? '#f59e0b' : 'var(--primary)', bg: 'var(--bg-card)', border: 'var(--border)' },
              { label: 'לא מזוהים',      value: unknown.length, color: '#92400e',        bg: '#fff7ed',        border: '#fed7aa' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Comparison table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  {['צמיג', 'מקט', 'במערכת', 'נסרקו', 'הפרש'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'center' : 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {known.map(e => {
                  const tire = tires.find(t => t.id === e.tireId)!
                  const diff = e.scanned - tire.qty
                  const rowBg = diff > 0 ? '#f0fdf4' : diff < 0 ? '#fef2f2' : 'var(--bg-card)'
                  return (
                    <tr key={e.sku} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                      <td style={{ padding: '10px 16px', fontWeight: 700 }}>{e.label}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{e.sku}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>{tire.qty}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700 }}>{e.scanned}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: diff > 0 ? 'var(--primary)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {diff === 0 ? '—' : diff > 0 ? `+${diff}` : String(diff)}
                      </td>
                    </tr>
                  )
                })}
                {unknown.map(e => (
                  <tr key={e.sku} style={{ borderBottom: '1px solid var(--border)', background: '#fff7ed' }}>
                    <td style={{ padding: '10px 16px', color: '#92400e', fontWeight: 600 }}>⚠ לא מזוהה</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#92400e' }}>{e.sku}</td>
                    <td colSpan={3} style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      יש לשייך מקט בניהול הצמיגים ואז לחזור לסרוק
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>אין פריטים — חזור לסריקה</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="secondary" onClick={() => setPhase('scan')}>← חזור לסריקה</Button>
            <Button onClick={confirmUpdate} loading={saving} disabled={known.length === 0}>
              ✓ אשר ועדכן {known.length} צמיגים
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
