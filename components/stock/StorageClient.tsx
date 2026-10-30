'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/components/yard-hub/ui'
import StorageMap from './StorageMap'
import StorageMapEditor from './StorageMapEditor'
import ZoneCountPanel from './ZoneCountPanel'
import { resetLayoutCache } from './LocationBadge'
import { tireSizeText } from '@/lib/tires/size'
import {
  cabinetCodes, countFreshness, formatLocation, isKnownShelf, parseLocation, type StorageLayout,
} from '@/lib/stock/storage'

// Office page /tires/storage: the cabinets map (coloured by how long since each cabinet was counted),
// count by zone, fixing tire locations the map doesn't recognise, and (admin) editing the map.

type Tab = 'map' | 'count' | 'fix'

interface FixTire { id: string; brand: string | null; width: number | null; profile: number | null; rim: number | null; sku: string | null; qty: number; location: string | null }

export default function StorageClient() {
  const router = useRouter()
  const { profile } = useProfile()
  const { showToast } = useToast()
  const sb = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('map')
  const [map, setMap] = useState<{ layout: StorageLayout; saved: boolean; lastCount: Record<string, string> } | null>(null)
  const [editing, setEditing] = useState(false)
  const [fix, setFix] = useState<FixTire[] | null>(null)
  const [fixVal, setFixVal] = useState<Record<string, string>>({})

  const loadMap = useCallback(async () => {
    try { setMap(await api('/api/yard/storage-map')) }
    catch (e) { showToast(`שגיאה בטעינת התרשים: ${(e as Error).message}`, 'error') }
  }, [showToast])

  useEffect(() => { loadMap() }, [loadMap])

  const loadFix = useCallback(async () => {
    if (!profile) return
    const out: FixTire[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('tires').select('id, brand, width, profile, rim, sku, qty, location')
        .eq('tenant_id', profile.tenantId).gt('qty', 0).order('id').range(from, from + 999)
      out.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    setFix(out)
  }, [sb, profile])

  useEffect(() => { if (tab === 'fix') loadFix() }, [tab, loadFix])

  async function saveLayout(l: StorageLayout) {
    try {
      await api('/api/yard/storage-map', 'PUT', { layout: l })
      showToast('התרשים נשמר ✓', 'success')
      setEditing(false); loadMap()
    } catch (e) { showToast(`שגיאה: ${(e as Error).message}`, 'error') }
  }

  // Tires in stock whose location isn't a shelf on the map (free text, empty, or a cabinet that doesn't exist)
  const badLocations = useMemo(() => {
    if (!fix || !map) return []
    return fix.filter(t => {
      const s = parseLocation(t.location)
      return !s.length || s.some(x => !isKnownShelf(map.layout, x)) || formatLocation(s) !== t.location
    })
  }, [fix, map])

  async function saveFix(t: FixTire, value: string) {
    const shelves = parseLocation(value)
    const loc = formatLocation(shelves) ?? (value.trim() || null)
    const { error } = await sb.from('tires').update({ location: loc }).eq('id', t.id)
    if (error) { showToast('שגיאה בשמירה', 'error'); return }
    setFix(f => f?.map(x => x.id === t.id ? { ...x, location: loc } : x) ?? null)
    setFixVal(v => { const n = { ...v }; delete n[t.id]; return n })
  }

  async function autoFormatAll() {
    // "a3" / "b 2" / "A3B2" → "A3" / "B2" / "A3, B2" — only where every part is a shelf on the map
    const todo = badLocations.filter(t => {
      const s = parseLocation(t.location)
      return s.length && s.every(x => isKnownShelf(map!.layout, x)) && formatLocation(s) !== t.location
    })
    for (const t of todo) await sb.from('tires').update({ location: formatLocation(parseLocation(t.location)) }).eq('id', t.id)
    showToast(`תוקנו ${todo.length} מיקומים ✓`, 'success')
    loadFix()
  }

  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => { setTab(t); setEditing(false) }} className={`rounded-lg font-bold ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
      style={{ padding: '8px 16px', fontSize: 14 }}>{label}</button>
  )

  const autoFixable = map ? badLocations.filter(t => {
    const s = parseLocation(t.location)
    return s.length && s.every(x => isKnownShelf(map.layout, x))
  }).length : 0

  return (
    <div style={{ direction: 'rtl', maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div className="flex justify-between items-start gap-3 flex-wrap" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>ארונות וספירה לפי אזור</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0 0' }}>מיקום = אות הארון + מספר המדף מלמעלה (B3 = ארון B, מדף שלישי)</p>
        </div>
        <button onClick={() => router.push('/tires')} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          ← חזור לצמיגים
        </button>
      </div>

      <div className="inline-flex gap-1 bg-slate-100 rounded-xl" style={{ padding: 4, marginBottom: 16 }}>
        {tabBtn('map', '🗺 תרשים')}
        {tabBtn('count', '🔢 ספירה לפי אזור')}
        {tabBtn('fix', `🛠 מיקומים לתיקון${fix ? ` (${badLocations.length})` : ''}`)}
      </div>

      {tab === 'map' && !map && <div className="text-slate-400">טוען...</div>}

      {tab === 'map' && map && !editing && (
        <div className="flex flex-col gap-3">
          {!map.saved && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl text-amber-900" style={{ padding: '10px 14px', fontSize: 14 }}>
              זה תרשים התחלתי לפי התיאור שלך — {profile?.isAdmin ? 'לחץ "ערוך תרשים" כדי לסדר אותו כמו במחסן ולשמור.' : 'המנהל צריך לסדר ולשמור אותו.'}
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200" style={{ padding: 14 }}>
            <StorageMap layout={map.layout}
              cabinetTint={Object.fromEntries(cabinetCodes(map.layout).map(c => [c, countFreshness(map.lastCount[c])]))} />
            <div className="flex flex-wrap gap-3 text-slate-600" style={{ fontSize: 12, marginTop: 10 }}>
              <span>צבע הארון = מתי נספר:</span>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>■ עד 30 יום</span>
              <span style={{ color: '#b45309', fontWeight: 700 }}>■ עד 90 יום</span>
              <span style={{ color: '#b91c1c', fontWeight: 700 }}>■ מעל / לא נספר</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200" style={{ padding: 14 }}>
            <div className="font-bold text-slate-700" style={{ marginBottom: 8 }}>ספירה אחרונה לכל ארון</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {cabinetCodes(map.layout).map(c => {
                const f = countFreshness(map.lastCount[c])
                return (
                  <div key={c} className="rounded-lg flex justify-between items-center" style={{ padding: '8px 10px', background: f.bg, color: f.color, fontWeight: 700, fontSize: 14 }}>
                    <span>ארון {c}</span>
                    <span style={{ fontSize: 12 }}>{f.days === null ? 'לא נספר' : f.days === 0 ? 'היום' : `לפני ${f.days} ימים`}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setTab('count')} className="bg-blue-700 text-white rounded-xl font-bold" style={{ padding: '10px 18px' }}>התחל ספירה לפי אזור</button>
            {profile?.isAdmin && <button onClick={() => setEditing(true)} className="bg-white border-2 border-slate-300 rounded-xl font-bold text-slate-700" style={{ padding: '10px 18px' }}>ערוך תרשים</button>}
          </div>
        </div>
      )}

      {tab === 'map' && map && editing && (
        <StorageMapEditor initial={map.layout} onCancel={() => setEditing(false)}
          onSave={async l => { await saveLayout(l); resetLayoutCache() }} />
      )}

      {tab === 'count' && <ZoneCountPanel variant="office" />}

      {tab === 'fix' && (
        <div className="flex flex-col gap-3">
          <div className="text-slate-600" style={{ fontSize: 14 }}>
            צמיגים במלאי שהמיקום שלהם לא מזוהה בתרשים (ריק, טקסט חופשי, או ארון שלא קיים). כתוב מיקום כמו <b>B3</b> או <b>B3, C3</b>.
          </div>
          {autoFixable > 0 && (
            <button onClick={autoFormatAll} className="self-start bg-blue-700 text-white rounded-xl font-bold" style={{ padding: '10px 16px' }}>
              תקן אוטומטית {autoFixable} מיקומים (a3 → A3)
            </button>
          )}
          {!fix && <div className="text-slate-400">טוען...</div>}
          {fix && badLocations.length === 0 && <div className="text-green-700 font-bold">✓ כל המיקומים תקינים</div>}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {badLocations.slice(0, 300).map(t => (
              <div key={t.id} className="flex items-center gap-2 border-b border-slate-100 flex-wrap" style={{ padding: '8px 12px' }}>
                <div className="flex-1" style={{ minWidth: 160 }}>
                  <div className="font-bold" style={{ fontSize: 14 }}>{[t.brand, tireSizeText(t)].filter(Boolean).join(' ') || t.sku || '—'}</div>
                  <div className="text-slate-500" style={{ fontSize: 12 }}>מלאי {t.qty} · עכשיו: {t.location || 'ריק'}</div>
                </div>
                <input value={fixVal[t.id] ?? ''} onChange={e => setFixVal(v => ({ ...v, [t.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && fixVal[t.id]) saveFix(t, fixVal[t.id]) }}
                  placeholder="B3" aria-label="מיקום חדש"
                  className="border-2 border-slate-200 focus:border-blue-500 rounded-lg outline-none" style={{ width: 110, padding: '6px 8px', fontWeight: 700 }} />
                <button disabled={!fixVal[t.id]} onClick={() => saveFix(t, fixVal[t.id])}
                  className="bg-green-700 text-white rounded-lg font-bold disabled:opacity-30" style={{ padding: '6px 12px' }}>שמור</button>
              </div>
            ))}
          </div>
          {badLocations.length > 300 && <div className="text-slate-500" style={{ fontSize: 13 }}>מוצגים 300 ראשונים — תקן ורענן להמשך.</div>}
        </div>
      )}
    </div>
  )
}

