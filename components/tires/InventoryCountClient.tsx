'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface CountSession {
  id: string
  counted_at: string
  notes: string | null
  is_first: boolean
}

interface CountEntry {
  tire_id: string | null
  sku: string | null
  label: string | null
  counted_qty: number
  expected_qty: number | null
}

interface TireSale {
  tire_id: string
  qty: number
  movement_type: 'sale' | 'order'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tireSize(t: TireRow) { return `${t.width}/${t.profile}R${t.rim}` }
function tireLabel(t: TireRow) { return [t.brand, tireSize(t)].filter(Boolean).join(' ') }

// ── Component ──────────────────────────────────────────────────────────────────

export default function InventoryCountClient() {
  const router  = useRouter()
  const sb      = useRef(createClient()).current
  const { profile } = useProfile()
  const { showToast } = useToast()
  const tenantId = useRef('')

  const [tires,        setTires]        = useState<TireRow[]>([])
  const [lastSession,  setLastSession]  = useState<CountSession | null>(null)
  const [lastEntries,  setLastEntries]  = useState<CountEntry[]>([])
  const [movements,    setMovements]    = useState<TireSale[]>([])
  const [loading,      setLoading]      = useState(true)
  const [phase,        setPhase]        = useState<'scan' | 'review'>('scan')
  const [query,        setQuery]        = useState('')
  const [entries,      setEntries]      = useState<ScanEntry[]>([])
  const [sessionNotes, setSessionNotes] = useState('')
  const [saving,       setSaving]       = useState(false)

  const [scanMode,   setScanMode]   = useState(false)
  const [scanBuffer, setScanBuffer] = useState('')
  const scanRef  = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      const tid = profile.tenantId
      tenantId.current = tid

      const [{ data: ts }, { data: sessions }] = await Promise.all([
        sb.from('tires').select('id, sku, brand, width, profile, rim, qty').eq('tenant_id', tid),
        sb.from('tire_inventory_count_sessions')
          .select('id, counted_at, notes, is_first')
          .eq('tenant_id', tid)
          .order('counted_at', { ascending: false })
          .limit(1),
      ])

      setTires(ts ?? [])
      const last = sessions?.[0] ?? null
      setLastSession(last)

      if (last) {
        const [{ data: prevEntries }, { data: mvs }] = await Promise.all([
          sb.from('tire_inventory_count_entries').select('tire_id, sku, label, counted_qty, expected_qty').eq('session_id', last.id),
          sb.from('tire_sales')
            .select('tire_id, qty, movement_type')
            .eq('tenant_id', tid)
            .gte('sold_date', last.counted_at.slice(0, 10)),
        ])
        setLastEntries(prevEntries ?? [])
        setMovements(mvs ?? [])
      }

      setLoading(false)
    })()
  }, [sb, profile])

  // ── Computed maps ─────────────────────────────────────────────────────────────

  const skuMap = useMemo(() => {
    const m = new Map<string, TireRow>()
    tires.forEach(t => { if (t.sku) m.set(t.sku.toLowerCase().trim(), t) })
    return m
  }, [tires])

  const lastEntryMap = useMemo(() => {
    const m = new Map<string, CountEntry>()
    lastEntries.forEach(e => { if (e.tire_id) m.set(e.tire_id, e) })
    return m
  }, [lastEntries])

  const movMap = useMemo(() => {
    const m = new Map<string, { orders: number; sales: number }>()
    movements.forEach(mv => {
      const cur = m.get(mv.tire_id) ?? { orders: 0, sales: 0 }
      if (mv.movement_type === 'order') cur.orders += mv.qty
      else cur.sales += mv.qty
      m.set(mv.tire_id, cur)
    })
    return m
  }, [movements])

  // ── Helpers ───────────────────────────────────────────────────────────────────

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

  function getExpected(tireId: string): { lastQty: number | null; ordersSince: number; salesSince: number; expectedQty: number | null } {
    if (!lastSession) return { lastQty: null, ordersSince: 0, salesSince: 0, expectedQty: null }
    const lastEntry = lastEntryMap.get(tireId)
    const lastQty = lastEntry?.counted_qty ?? null
    const mvs = movMap.get(tireId) ?? { orders: 0, sales: 0 }
    const expectedQty = lastQty !== null ? Math.max(0, lastQty + mvs.orders - mvs.sales) : null
    return { lastQty, ordersSince: mvs.orders, salesSince: mvs.sales, expectedQty }
  }

  // ── Confirm ───────────────────────────────────────────────────────────────────

  async function confirmUpdate() {
    const known = entries.filter(e => e.tireId !== null)
    if (known.length === 0) { showToast('אין פריטים לעדכון', 'error'); return }
    setSaving(true)

    const isFirst = !lastSession

    const { data: session, error: sessErr } = await sb
      .from('tire_inventory_count_sessions')
      .insert({ tenant_id: tenantId.current, notes: sessionNotes || null, is_first: isFirst })
      .select('id')
      .single()

    if (sessErr || !session) { showToast('שגיאה בשמירה', 'error'); setSaving(false); return }

    const sessEntries = known.map(e => {
      const tire = tires.find(t => t.id === e.tireId)
      const { expectedQty } = e.tireId ? getExpected(e.tireId) : { expectedQty: null }
      return {
        session_id:   session.id,
        tire_id:      e.tireId,
        sku:          e.sku,
        label:        e.label,
        counted_qty:  e.scanned,
        expected_qty: expectedQty,
        system_qty:   tire?.qty ?? null,
      }
    })

    await Promise.all([
      sb.from('tire_inventory_count_entries').insert(sessEntries),
      ...known.map(e => sb.from('tires').update({ qty: e.scanned }).eq('id', e.tireId!)),
    ])

    const discrepancyCount = known.filter(e => {
      if (!e.tireId || isFirst) return false
      const { expectedQty } = getExpected(e.tireId)
      return expectedQty !== null && e.scanned !== expectedQty
    }).length

    setSaving(false)
    if (!isFirst && discrepancyCount > 0)
      showToast(`נשמרה ספירה — ${discrepancyCount} חריגות זוהו ✓`, 'success')
    else
      showToast(`עודכנו ${known.length} צמיגים ✓`, 'success')
    router.push('/tires')
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const known    = entries.filter(e => e.tireId)
  const unknown  = entries.filter(e => !e.tireId)
  const isFirst  = !lastSession

  const missingFromScan = !isFirst
    ? lastEntries.filter(le => le.tire_id && !entries.find(e => e.tireId === le.tire_id))
    : []

  const diffCount = known.filter(e => {
    if (!e.tireId || isFirst) return false
    const { expectedQty } = getExpected(e.tireId)
    return expectedQty !== null && e.scanned !== expectedQty
  }).length + missingFromScan.length

  // ── Render helpers ────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl', maxWidth: '900px', margin: '0 auto', padding: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0 }}>📦 ספירת מלאי</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
            {isFirst
              ? 'ספירה מקיפה ראשונה — תיצור בסיס השוואה לספירות עתידיות'
              : `ספירה רגילה — השוואה לספירה מ-${new Date(lastSession!.counted_at).toLocaleDateString('he-IL')}`}
          </p>
        </div>
        <button onClick={() => router.push('/tires')} style={{
          padding: '8px 16px', border: '1px solid var(--border)', borderRadius: '8px',
          background: 'var(--bg)', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
        }}>← חזור לצמיגים</button>
      </div>

      {/* Banners */}
      {isFirst && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#15803d' }}>
          🟢 <strong>ספירה ראשונה:</strong> תוצאות יישמרו כנקודת בסיס. ספירות עתידיות ישוו מולה בהתחשב בתנועות מלאי אוטומטיות.
        </div>
      )}
      {!isFirst && diffCount > 0 && phase === 'review' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          ⚠️ נמצאו <strong>{diffCount} צמיגים</strong> עם חריגה מהכמות הצפויה — מסומנים בטבלה.
        </div>
      )}

      {/* Phase tabs */}
      <div style={{ display: 'inline-flex', gap: '4px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', marginBottom: '20px' }}>
        {tabBtn('scan',   `📡 סריקה${entries.length ? ` (${entries.length})` : ''}`)}
        {tabBtn('review', `📋 סיכום${known.length ? ` (${known.length})` : ''}${diffCount > 0 ? ` ⚠${diffCount}` : ''}`)}
      </div>

      {/* ══ SCAN ══ */}
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
              style={{ flex: 1, padding: '12px 16px', border: '2px solid var(--accent)', borderRadius: '12px', fontSize: '16px', outline: 'none', fontFamily: 'inherit' }}
            />
            <button onClick={() => addScan(query)} style={{ padding: '0 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '15px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>הוסף</button>
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

          <input ref={scanRef} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            value={scanBuffer} onChange={e => setScanBuffer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && scanBuffer) { addScan(scanBuffer); setScanBuffer('') } }} />

          {scanMode && (
            <div style={{ background: '#2563eb', color: '#fff', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>📡 ממתין לסריקה...</span>
              <button onClick={() => setScanMode(false)} style={{ background: 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.4)', color: '#fff', borderRadius: '8px', padding: '4px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>ביטול</button>
            </div>
          )}

          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '12px' }}>
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
                  <div key={e.sku} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: e.tireId ? 'var(--bg-card)' : '#fff7ed' }}>
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
                <Button onClick={() => setPhase('review')}>סיים ועבור לסיכום ({entries.length} פריטים) →</Button>
              </div>
            </>
          )}
        </>
      )}

      {/* ══ REVIEW ══ */}
      {phase === 'review' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {([
              { label: 'זוהו',        value: known.length,   color: 'var(--accent)',   bg: 'var(--bg-card)', border: 'var(--border)' },
              ...(!isFirst ? [{ label: 'חריגות',      value: diffCount,      color: diffCount > 0 ? '#dc2626' : 'var(--primary)', bg: diffCount > 0 ? '#fef2f2' : 'var(--bg-card)', border: diffCount > 0 ? '#fecaca' : 'var(--border)' }] : []),
              ...(!isFirst && missingFromScan.length > 0 ? [{ label: 'חסרים מספירה', value: missingFromScan.length, color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' }] : []),
              { label: 'לא מזוהים', value: unknown.length, color: '#92400e',          bg: '#fff7ed',        border: '#fed7aa' },
            ] as { label: string; value: number; color: string; bg: string; border: string }[]).map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '12px', padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                    {[
                      'צמיג', 'מקט',
                      ...(!isFirst ? ['ספירה קודמת', 'תנועות מאז', 'צפוי'] : []),
                      'במערכת', 'נסרקו', 'הפרש',
                    ].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i <= 1 ? 'right' : 'center', fontWeight: 600, color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Scanned & identified */}
                  {known.map(e => {
                    const tire = tires.find(t => t.id === e.tireId)
                    const { lastQty, ordersSince, salesSince, expectedQty } = e.tireId ? getExpected(e.tireId) : { lastQty: null, ordersSince: 0, salesSince: 0, expectedQty: null }
                    const compareQty = expectedQty ?? tire?.qty ?? 0
                    const diff = e.scanned - compareQty
                    const hasDiscrepancy = !isFirst && expectedQty !== null && diff !== 0
                    const rowBg = hasDiscrepancy ? (diff < 0 ? '#fef2f2' : '#fffbeb') : 'var(--bg-card)'
                    const movLabel = (ordersSince || salesSince)
                      ? [ordersSince > 0 ? `+${ordersSince}` : null, salesSince > 0 ? `−${salesSince}` : null].filter(Boolean).join(' / ')
                      : '—'
                    return (
                      <tr key={e.sku} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          {hasDiscrepancy && <span style={{ marginLeft: 5, fontSize: 12 }}>⚠️</span>}
                          {e.label}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{e.sku}</td>
                        {!isFirst && <td style={{ padding: '10px 14px', textAlign: 'center', color: lastQty !== null ? 'var(--text)' : 'var(--text-muted)' }}>{lastQty ?? '—'}</td>}
                        {!isFirst && <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{movLabel}</td>}
                        {!isFirst && <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{expectedQty ?? '—'}</td>}
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{tire?.qty ?? '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{e.scanned}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: diff === 0 ? 'var(--text-muted)' : diff > 0 ? 'var(--primary)' : 'var(--danger)' }}>
                          {diff === 0 ? '—' : diff > 0 ? `+${diff}` : String(diff)}
                        </td>
                      </tr>
                    )
                  })}

                  {/* In last count but not scanned this time */}
                  {!isFirst && missingFromScan.map(le => {
                    const tire = tires.find(t => t.id === le.tire_id)
                    const { ordersSince, salesSince, expectedQty } = le.tire_id ? getExpected(le.tire_id) : { ordersSince: 0, salesSince: 0, expectedQty: null }
                    const movLabel = (ordersSince || salesSince)
                      ? [ordersSince > 0 ? `+${ordersSince}` : null, salesSince > 0 ? `−${salesSince}` : null].filter(Boolean).join(' / ')
                      : '—'
                    const diff = 0 - (expectedQty ?? 0)
                    return (
                      <tr key={le.tire_id} style={{ borderBottom: '1px solid var(--border)', background: '#fef2f2' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--danger)' }}>
                          ⚠️ לא נסרק — {le.label || (tire ? tireLabel(tire) : '—')}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{le.sku}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{le.counted_qty}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>{movLabel}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{expectedQty ?? '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{tire?.qty ?? '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }}>0</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }}>
                          {expectedQty !== null ? `−${expectedQty}` : '—'}
                        </td>
                      </tr>
                    )
                  })}

                  {/* Unidentified */}
                  {unknown.map(e => (
                    <tr key={e.sku} style={{ borderBottom: '1px solid var(--border)', background: '#fff7ed' }}>
                      <td style={{ padding: '10px 14px', color: '#92400e', fontWeight: 600 }}>⚠ לא מזוהה</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#92400e' }}>{e.sku}</td>
                      {!isFirst && <td colSpan={3} />}
                      <td colSpan={3} style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                        יש לשייך מקט בניהול הצמיגים
                      </td>
                    </tr>
                  ))}

                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={isFirst ? 5 : 8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        אין פריטים — חזור לסריקה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>הערות לספירה (אופציונלי)</label>
            <textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              rows={2}
              placeholder="לדוגמה: נמצא פגיעת לחות במדף A3, צמיגים הוזזו לפני הספירה..."
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: '10px', fontFamily: 'inherit', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="secondary" onClick={() => setPhase('scan')}>← חזור לסריקה</Button>
            <Button onClick={confirmUpdate} loading={saving} disabled={known.length === 0}>
              {isFirst ? '✓ שמור ספירה ראשונה' : `✓ אשר ועדכן ${known.length} צמיגים`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
