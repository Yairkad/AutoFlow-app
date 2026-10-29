'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { api } from '@/components/yard-hub/ui'
import TirePickerModal from '@/components/tires/TirePickerModal'
import StorageMap from './StorageMap'
import { allShelves, cabinetOf, findCabinet, parseLocation, shelvesOfCabinet, sortShelves, type StorageLayout } from '@/lib/stock/storage'
import {
  ROUND_DAYS, buildReview, expandScope, expectedTires, shelfSizeChanges, tireLabel, toSave,
  type CountRound, type OutsideChoice, type ReviewRow, type ZoneEntry, type ZoneTire,
} from '@/lib/stock/zoneCount'

// Count part of the stock: pick cabinets / shelves on the map, scan shelf by shelf, review, save.
// Same screen on the yard terminal (variant 'yard') and in the office (variant 'office').
// The work in progress is kept in localStorage, so a refresh / lock screen doesn't lose it.
// Shelves already counted this round show orange on the map (red dot = sizes changed since).

type Step = 'pick' | 'scan' | 'review' | 'done'

interface Draft {
  step: Step
  scope: string[]
  added: string[]
  active: string
  entries: ZoneEntry[]
  outsideChoice: Record<string, OutsideChoice>
  keep: string[]          // expected-but-not-found tires the user chose NOT to zero
  notes: string
}

const DRAFT_KEY = 'autoflow.zoneCount.v1'

function loadDraft(): Draft | null {
  try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) as Draft : null } catch { return null }
}
function saveDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY) } catch { /* private mode */ }
}

const btn = 'rounded-xl font-bold active:scale-[.98] transition-all disabled:opacity-40'

export default function ZoneCountPanel({ variant }: { variant: 'yard' | 'office' }) {
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const [data, setData] = useState<{ layout: StorageLayout; tires: ZoneTire[]; round: CountRound } | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('pick')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<string[]>([])
  const [added, setAdded] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [entries, setEntries] = useState<ZoneEntry[]>([])
  const [outsideChoice, setOutsideChoice] = useState<Record<string, OutsideChoice>>({})
  const [keep, setKeep] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ updated: number; created: number } | null>(null)
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null)

  const [code, setCode] = useState('')
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'link'; key: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { setData(await api<{ layout: StorageLayout; tires: ZoneTire[]; round: CountRound }>('/api/yard/zone-count')) }
    catch (e) { setLoadErr((e as Error).message) }
  }, [])

  useEffect(() => { load(); setPendingDraft(loadDraft()) }, [load])

  // Keep the draft in sync while counting
  useEffect(() => {
    if (step !== 'scan' && step !== 'review') return
    saveDraft({ step, scope, added, active, entries, outsideChoice, keep: [...keep], notes })
  }, [step, scope, added, active, entries, outsideChoice, keep, notes])

  useEffect(() => { if (step === 'scan') inputRef.current?.focus() }, [step, active])

  const tires = useMemo(() => data?.tires ?? [], [data])
  const skuMap = useMemo(() => {
    const m = new Map<string, ZoneTire>()
    tires.forEach(t => { if (t.sku) m.set(t.sku.toLowerCase().trim(), t) })
    return m
  }, [tires])
  const tireById = useMemo(() => new Map(tires.map(t => [t.id, t])), [tires])

  // ── Count round ───────────────────────────────────────────────────────────────

  const round = useMemo(() => {
    if (!data) return null
    const all = allShelves(data.layout)
    const done = new Set(all.filter(s => data.round.shelves[s]))
    const changes = [...done].map(s => ({ shelf: s, ...shelfSizeChanges(data.round.shelves[s], s, tires) }))
      .filter(c => c.added.length || c.removed.length)
    const cabinets = data.layout.rows.flatMap(r => r.cabinets)
    const doneCabs = new Set(cabinets.filter(c => shelvesOfCabinet(c).every(s => done.has(s))).map(c => c.code))
    return {
      all, done, changes, dot: new Set(changes.map(c => c.shelf)),
      tint: Object.fromEntries([...doneCabs].map(c => [c, { bg: '#fb923c', color: '#fff' }])),
      nextCab: cabinets.find(c => !doneCabs.has(c.code)) ?? null,
    }
  }, [data, tires])

  async function newRound() {
    if (!await confirm({ msg: 'להתחיל סבב ספירה חדש? כל המדפים יחזרו לסימון "לא נספר"', icon: '🔄' })) return
    try { await api('/api/yard/zone-count', 'PUT'); showToast('התחיל סבב ספירה חדש', 'success'); load() }
    catch (e) { showToast(`שגיאה: ${(e as Error).message}`, 'error') }
  }

  // ── Pick ──────────────────────────────────────────────────────────────────────

  function toggleShelf(s: string) {
    setPicked(p => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n })
  }
  function toggleCabinet(code: string) {
    if (!data) return
    const f = findCabinet(data.layout, code)
    if (!f) return
    const shelves = shelvesOfCabinet(f.cab)
    setPicked(p => {
      const n = new Set(p)
      const all = shelves.every(s => n.has(s))
      shelves.forEach(s => all ? n.delete(s) : n.add(s))
      return n
    })
  }

  function start(shelves = [...picked]) {
    if (!data || shelves.length === 0) return
    const { scope: sc, added: ad } = expandScope(data.layout, shelves, tires)
    setScope(sc); setAdded(ad); setActive(sc[0]); setEntries([]); setOutsideChoice({}); setKeep(new Set()); setNotes('')
    setStep('scan')
  }

  function resumeDraft(d: Draft) {
    setScope(d.scope); setAdded(d.added); setActive(d.active); setEntries(d.entries)
    setOutsideChoice(d.outsideChoice); setKeep(new Set(d.keep)); setNotes(d.notes)
    setStep(d.step === 'review' ? 'review' : 'scan'); setPendingDraft(null)
  }

  function discardDraft() { saveDraft(null); setPendingDraft(null) }

  // ── Scan ──────────────────────────────────────────────────────────────────────

  function bump(key: string, base: Omit<ZoneEntry, 'byShelf'>, shelf: string, delta: number) {
    setEntries(prev => {
      const i = prev.findIndex(e => e.key === key)
      if (i < 0) return delta > 0 ? [{ ...base, byShelf: { [shelf]: delta } }, ...prev] : prev
      const e = prev[i]
      const n = Math.max(0, (e.byShelf[shelf] ?? 0) + delta)
      const next = [...prev]
      next[i] = { ...e, byShelf: { ...e.byShelf, [shelf]: n } }
      return next
    })
  }

  function addTire(t: ZoneTire, shelf = active, delta = 1) {
    bump('id:' + t.id, { key: 'id:' + t.id, tireId: t.id, sku: t.sku ?? '', label: tireLabel(t) }, shelf, delta)
  }

  function scan(raw: string) {
    const c = raw.trim()
    setCode('')
    if (!c) return
    const t = skuMap.get(c.toLowerCase())
    if (t) {
      addTire(t)
      const where = parseLocation(t.location)
      const elsewhere = where.length && !where.includes(active)
      setFlash({ text: `✓ ${tireLabel(t)}${elsewhere ? ` · רשום ב-${t.location}` : ''}`, ok: !elsewhere })
    } else {
      const key = 'sku:' + c.toLowerCase()
      bump(key, { key, tireId: null, sku: c, label: '⚠ ברקוד לא מוכר' }, active, 1)
      setFlash({ text: `⚠ ברקוד לא מוכר: ${c} — ייקלט כצמיג חדש (אפשר לשייך)`, ok: false })
    }
    inputRef.current?.focus()
  }

  function linkUnknown(key: string, t: ZoneTire) {
    setEntries(prev => {
      const src = prev.find(e => e.key === key)
      if (!src) return prev
      const rest = prev.filter(e => e.key !== key)
      const ti = rest.findIndex(e => e.tireId === t.id)
      if (ti < 0) return [{ key: 'id:' + t.id, tireId: t.id, sku: t.sku ?? '', label: tireLabel(t), byShelf: src.byShelf }, ...rest]
      const merged = { ...rest[ti].byShelf }
      Object.entries(src.byShelf).forEach(([s, n]) => { merged[s] = (merged[s] ?? 0) + n })
      rest[ti] = { ...rest[ti], byShelf: merged }
      return rest
    })
    setPicker(null)
  }

  const shelfCount = useMemo(() => {
    const m: Record<string, number> = {}
    entries.forEach(e => Object.entries(e.byShelf).forEach(([s, n]) => { m[s] = (m[s] ?? 0) + n }))
    return m
  }, [entries])

  // Rows for the active shelf: what the system expects there + what was scanned there
  const shelfRows = useMemo(() => {
    const expected = tires.filter(t => parseLocation(t.location).includes(active))
    const rows: { key: string; label: string; sku: string; tire: ZoneTire | null; n: number }[] = []
    const seen = new Set<string>()
    entries.forEach(e => {
      if (!(e.byShelf[active] > 0)) return
      seen.add(e.key)
      rows.push({ key: e.key, label: e.label, sku: e.sku, tire: e.tireId ? tireById.get(e.tireId) ?? null : null, n: e.byShelf[active] })
    })
    expected.forEach(t => {
      if (seen.has('id:' + t.id)) return
      rows.push({ key: 'id:' + t.id, label: tireLabel(t), sku: t.sku ?? '', tire: t, n: 0 })
    })
    return rows
  }, [tires, entries, active, tireById])

  // ── Review ────────────────────────────────────────────────────────────────────

  const review: ReviewRow[] = useMemo(() => {
    if (!data || (step !== 'review' && step !== 'scan')) return []
    const zero = new Set(expectedTires(tires, scope).map(t => t.id).filter(id => !keep.has(id)))
    return buildReview(data.layout, scope, tires, entries, outsideChoice, zero)
  }, [data, step, scope, tires, entries, outsideChoice, keep])

  async function save() {
    setSaving(true)
    try {
      const r = await api<{ updated: number; created: number }>('/api/yard/zone-count', 'POST', toSave(scope, review, notes))
      saveDraft(null)
      await load()            // fresh round, so "continue to the next cabinet" skips this one
      setResult(r); setStep('done')
      showToast('הספירה נשמרה ✓', 'success')
    } catch (e) {
      showToast(`שגיאה בשמירה: ${(e as Error).message}`, 'error')
    } finally { setSaving(false) }
  }

  function reset() {
    setStep('pick'); setPicked(new Set()); setScope([]); setEntries([]); setResult(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const yard = variant === 'yard'
  const frame = (title: string, body: React.ReactNode, footer?: React.ReactNode) => (
    <div className="flex flex-col" style={{ height: yard ? '100%' : undefined, background: yard ? '#f0f4f8' : undefined, direction: 'rtl' }}>
      {yard && (
        <div className="bg-slate-800 text-white flex-shrink-0" style={{ padding: '12px 16px' }}>
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      )}
      <div className={yard ? 'flex-1 overflow-y-auto' : ''} style={{ minHeight: 0, padding: yard ? 14 : 0 }}>
        <div className="flex flex-col gap-3" style={{ maxWidth: 760, margin: '0 auto' }}>{body}</div>
      </div>
      {footer && (
        <div className="flex-shrink-0 bg-white border-t border-slate-200 flex gap-2" style={{ padding: 10, ...(yard ? {} : { position: 'sticky', bottom: 0, marginTop: 12 }) }}>
          {footer}
        </div>
      )}
    </div>
  )

  if (loadErr) return frame('🔢 ספירת מלאי', <div className="text-red-600 font-bold">שגיאה בטעינה: {loadErr}</div>)
  if (!data) return frame('🔢 ספירת מלאי', <div className="text-slate-400">טוען...</div>)

  if (step === 'pick') {
    const pickedCabs = sortShelves([...picked])
    return frame('🔢 ספירת מלאי לפי אזור', <>
      {pendingDraft && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col gap-2" style={{ padding: 12 }}>
          <div className="font-bold text-amber-900">יש ספירה שלא הסתיימה ({pendingDraft.scope.join(', ')})</div>
          <div className="flex gap-2">
            <button onClick={() => resumeDraft(pendingDraft)} className={`${btn} bg-amber-600 text-white flex-1`} style={{ padding: 12 }}>המשך אותה</button>
            <button onClick={discardDraft} className={`${btn} bg-white border-2 border-amber-300 text-amber-900`} style={{ padding: 12 }}>מחק</button>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200" style={{ padding: 12 }}>
        <div className="font-bold text-slate-700" style={{ fontSize: 15, marginBottom: 4 }}>מה סופרים?</div>
        <div className="text-slate-500" style={{ fontSize: 13, marginBottom: 10 }}>
          לחיצה על האות = כל הארון · לחיצה על מדף = רק המדף. אפשר לבחור כמה.
        </div>
        <StorageMap layout={data.layout} selected={picked} onShelf={toggleShelf} onCabinet={toggleCabinet}
          done={round?.done} dot={round?.dot} cabinetTint={round?.tint} />
        {round && (
          <div className="flex flex-col gap-2" style={{ marginTop: 10, fontSize: 13 }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">
              <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#fdba74', verticalAlign: 'middle', marginLeft: 4 }} />
                נספר בסבב: <b>{round.done.size} מתוך {round.all.length} מדפים</b></span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: '#dc2626', verticalAlign: 'middle', marginLeft: 4 }} />
                נכנסה / יצאה מידה מאז הספירה</span>
              <span className="text-slate-400">
                {data.round.startedAt ? `סבב מ-${new Date(data.round.startedAt).toLocaleDateString('he-IL')}` : `${ROUND_DAYS} הימים האחרונים`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {round.done.size < round.all.length && (
                <button onClick={() => setPicked(new Set(round.all.filter(s => !round.done.has(s))))}
                  className={`${btn} bg-blue-50 text-blue-800 border border-blue-200`} style={{ padding: '7px 10px', fontSize: 13 }}>
                  בחר כל מה שלא נספר ({round.all.length - round.done.size})
                </button>
              )}
              <button onClick={() => setPicked(new Set(round.all))}
                className={`${btn} bg-slate-50 text-slate-700 border border-slate-200`} style={{ padding: '7px 10px', fontSize: 13 }}>בחר הכל</button>
              {round.done.size > 0 && (
                <button onClick={newRound} className={`${btn} bg-white text-orange-800 border border-orange-300`} style={{ padding: '7px 10px', fontSize: 13 }}>
                  סבב ספירה חדש
                </button>
              )}
            </div>
            {round.changes.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg text-red-900" style={{ padding: '6px 10px' }}>
                <b>שינוי מידות מאז הספירה:</b>
                {round.changes.map(c => (
                  <div key={c.shelf}>
                    <b><bdi dir="ltr">{c.shelf}</bdi></b>
                    {c.added.length > 0 && <> · נכנס: <bdi dir="ltr">{c.added.join(', ')}</bdi></>}
                    {c.removed.length > 0 && <> · יצא: <bdi dir="ltr">{c.removed.join(', ')}</bdi></>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {pickedCabs.length > 0 && (
        <div className="text-slate-600" style={{ fontSize: 14 }}>
          נבחרו {pickedCabs.length} מדפים: {[...new Set(pickedCabs.map(cabinetOf))].map(c => {
            const f = findCabinet(data.layout, c)
            const n = pickedCabs.filter(s => cabinetOf(s) === c).length
            return f && n === f.cab.shelves ? `ארון ${c}` : pickedCabs.filter(s => cabinetOf(s) === c).join(', ')
          }).join(' · ')}
        </div>
      )}
    </>, <>
      {picked.size > 0 && <button onClick={() => setPicked(new Set())} className={`${btn} bg-slate-100 text-slate-700`} style={{ padding: '14px 16px' }}>נקה</button>}
      <button onClick={() => start()} disabled={picked.size === 0} className={`${btn} bg-blue-700 text-white flex-1`} style={{ padding: 14, fontSize: 17 }}>
        התחל ספירה{picked.size ? ` (${picked.size} מדפים)` : ''} ←
      </button>
    </>)
  }

  if (step === 'scan') {
    const totalUnits = Object.values(shelfCount).reduce((a, b) => a + b, 0)
    return frame(`🔢 סופרים: ${scope.length > 6 ? `${scope.length} מדפים` : scope.join(', ')}`, <>
      {added.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl text-blue-900" style={{ padding: '8px 12px', fontSize: 13 }}>
          נוספו לספירה גם {added.join(', ')} — יש שם צמיגים שרשומים גם על המדפים שבחרת, וצריך לספור אותם במלואם.
        </div>
      )}

      {/* Shelf chips: which shelf you're standing at */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span className="font-bold text-slate-700" style={{ fontSize: 14 }}>על איזה מדף אתה סורק?</span>
          <button onClick={() => setShowMap(m => !m)} className="text-blue-700 font-bold" style={{ fontSize: 13 }}>{showMap ? 'הסתר תרשים' : 'תרשים'}</button>
        </div>
        {showMap ? (
          <div className="bg-white rounded-xl border border-slate-200" style={{ padding: 10 }}>
            <StorageMap layout={data.layout} selected={new Set(scope)} highlight={new Set([active])}
              shelfBadge={Object.fromEntries(Object.entries(shelfCount).filter(([, n]) => n > 0))}
              onShelf={s => { if (scope.includes(s)) setActive(s) }} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {scope.map(s => (
              <button key={s} onClick={() => setActive(s)}
                className={`rounded-lg font-black border-2 ${s === active ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300'}`}
                style={{ padding: '8px 12px', fontSize: 16, minWidth: 56 }}>
                {s}{shelfCount[s] ? <span style={{ fontSize: 11, marginRight: 4, opacity: .85 }}>· {shelfCount[s]}</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); scan(code) }} className="flex gap-2">
        <input ref={inputRef} value={code} onChange={e => setCode(e.target.value)} autoComplete="off"
          placeholder={`סרוק ברקוד — מדף ${active}`} aria-label="ברקוד"
          className="flex-1 border-2 border-blue-600 rounded-xl outline-none font-bold" style={{ padding: '12px 14px', fontSize: 17, minWidth: 0 }} />
        <button type="submit" className={`${btn} bg-blue-700 text-white`} style={{ padding: '0 18px', fontSize: 16 }}>הוסף</button>
      </form>
      {flash && (
        <div className={`rounded-xl font-bold ${flash.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-900 border border-amber-300'}`}
          style={{ padding: '8px 12px', fontSize: 14 }}>{flash.text}</div>
      )}
      <button onClick={() => setPicker({ mode: 'add' })} className="self-start text-blue-700 font-bold" style={{ fontSize: 14 }}>
        צמיג בלי ברקוד? בחר מהרשימה
      </button>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="font-bold text-slate-700 border-b border-slate-200 flex items-center justify-between gap-2" style={{ padding: '8px 12px', fontSize: 15 }}>
          <span>מדף {active} <span className="text-slate-500 font-semibold" style={{ fontSize: 13 }}>· {shelfCount[active] ?? 0} נסרקו</span></span>
          {scope.length > 1 && (() => {
            const i = scope.indexOf(active)
            return (
              <span className="flex gap-1.5">
                <button onClick={() => setActive(scope[i - 1])} disabled={i <= 0}
                  className={`${btn} bg-slate-100 text-slate-700`} style={{ padding: '8px 10px', fontSize: 14 }}>→ הקודם</button>
                <button onClick={() => setActive(scope[i + 1])} disabled={i >= scope.length - 1}
                  className={`${btn} bg-blue-700 text-white`} style={{ padding: '8px 12px', fontSize: 14 }}>
                  {i < scope.length - 1 ? `מדף הבא ${scope[i + 1]} ←` : 'מדף אחרון'}
                </button>
              </span>
            )
          })()}
        </div>
        {shelfRows.length === 0 && <div className="text-slate-400 text-center" style={{ padding: 20, fontSize: 14 }}>אין צמיגים רשומים על המדף הזה — סרוק מה שיש עליו</div>}
        {shelfRows.map(r => (
          <div key={r.key} className={`flex items-center gap-2 border-b border-slate-100 ${r.n === 0 ? 'opacity-60' : ''}`} style={{ padding: '8px 12px', background: r.tire ? undefined : '#fff7ed' }}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-800 truncate" style={{ fontSize: 15 }}>{r.n > 0 ? '✓ ' : ''}{r.label}</div>
              <div className="text-slate-500" style={{ fontSize: 12 }}>
                {r.tire ? <>במערכת: {r.tire.qty}{r.tire.location ? <> · רשום ב-<bdi dir="ltr">{r.tire.location}</bdi></> : ''}</> : <span style={{ direction: 'ltr' }}>{r.sku}</span>}
                {!r.tire && <button onClick={() => setPicker({ mode: 'link', key: r.key })} className="text-blue-700 font-bold underline" style={{ marginRight: 8 }}>שייך לצמיג קיים</button>}
              </div>
            </div>
            <button aria-label="פחות" onClick={() => r.tire ? addTire(r.tire, active, -1) : bump(r.key, { key: r.key, tireId: null, sku: r.sku, label: r.label }, active, -1)}
              className="bg-slate-100 rounded-lg font-black text-slate-600" style={{ width: 40, height: 40, fontSize: 20 }}>−</button>
            <span className="font-black text-center" style={{ width: 30, fontSize: 18 }}>{r.n}</span>
            <button aria-label="עוד" onClick={() => r.tire ? addTire(r.tire, active, 1) : bump(r.key, { key: r.key, tireId: null, sku: r.sku, label: r.label }, active, 1)}
              className="bg-slate-100 rounded-lg font-black text-green-700" style={{ width: 40, height: 40, fontSize: 20 }}>+</button>
          </div>
        ))}
      </div>

      {picker && (
        <TirePickerModal tires={tires}
          title={picker.mode === 'add' ? `📋 הוסף צמיג למדף ${active}` : '🔗 שייך את הברקוד לצמיג קיים'}
          subtitle={picker.mode === 'add' ? 'כל בחירה מוסיפה יחידה אחת' : 'הכמות שנסרקה עם הברקוד תיספר בצמיג שתבחר'}
          onPick={t => { if (picker.mode === 'add') { addTire(t); setPicker(null) } else linkUnknown(picker.key, t) }}
          onClose={() => setPicker(null)} />
      )}
    </>, <>
      <button onClick={async () => { if (await confirm({ msg: 'לבטל את הספירה? מה שנסרק יימחק', icon: '🗑️' })) { saveDraft(null); reset() } }}
        className={`${btn} bg-slate-100 text-slate-700`} style={{ padding: '14px 16px' }}>ביטול</button>
      <button onClick={() => setStep('review')} className={`${btn} bg-green-700 text-white flex-1`} style={{ padding: 14, fontSize: 17 }}>
        סיימתי ({totalUnits} יח׳) — לסיכום ←
      </button>
    </>)
  }

  if (step === 'review') {
    const warn   = review.filter(r => r.split || r.kind === 'moved')
    const diffs  = review.filter(r => r.kind === 'diff' && !r.split)
    const miss   = review.filter(r => r.kind === 'missing')
    const news   = review.filter(r => r.kind === 'new')
    const ok     = review.filter(r => r.kind === 'ok' && !r.split)
    const line = (r: ReviewRow, extra?: React.ReactNode) => (
      <div key={r.key} className="border-b border-slate-100 flex flex-col gap-1" style={{ padding: '10px 12px' }}>
        <div className="flex justify-between gap-2">
          <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>{r.label}</span>
          <span className="font-black whitespace-nowrap flex items-center gap-1.5" style={{ fontSize: 15 }}>
            {r.systemQty !== null && r.systemQty !== r.newQty && <><span className="text-slate-400 line-through">{r.systemQty}</span><span className="text-slate-400">←</span></>}
            <span>{r.newQty} יח׳</span>
          </span>
        </div>
        <div className="text-slate-500" style={{ fontSize: 12.5 }}>
          {r.oldLocation !== r.newLocation
            ? <>מיקום: <bdi dir="ltr">{r.oldLocation || '—'}</bdi> ← <b className="text-slate-700"><bdi dir="ltr">{r.newLocation || '—'}</bdi></b></>
            : <>מיקום: <bdi dir="ltr">{r.newLocation || '—'}</bdi></>}
          {r.sku && <> · <span style={{ unicodeBidi: 'isolate' }}>{r.sku}</span></>}
        </div>
        {extra}
      </div>
    )
    const box = (title: string, color: string, rows: React.ReactNode) => (
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: color }}>
        <div className="font-black" style={{ padding: '10px 12px', fontSize: 15, color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>{title}</div>
        {rows}
      </div>
    )
    return frame('📋 סיכום ספירה', <>
      <div className="text-slate-600" style={{ fontSize: 14 }}>מדפים: {scope.join(', ')}</div>

      {warn.length > 0 && box(`⚠ לבדיקה (${warn.length})`, '#b91c1c', warn.map(r => line(r, <>
        {r.split && <div className="text-red-700 font-bold" style={{ fontSize: 13 }}>נמצא בשני מקומות לא צמודים — כדאי לרכז במקום אחד</div>}
        {r.kind === 'moved' && r.tire && (
          <div className="flex flex-col gap-1.5" style={{ fontSize: 13 }}>
            <span className="text-amber-800 font-bold">היה רשום ב-{r.outside.join(', ')} (מחוץ לספירה)</span>
            <div className="flex gap-1.5">
              {(['move', 'both'] as const).map(v => {
                const on = (outsideChoice[r.tire!.id] ?? 'move') === v
                return (
                  <button key={v} onClick={() => setOutsideChoice(c => ({ ...c, [r.tire!.id]: v }))}
                    className={`rounded-lg font-bold border-2 flex-1 ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}
                    style={{ padding: '7px 6px', fontSize: 13 }}>
                    {v === 'move' ? 'הכל עבר לכאן' : `יש גם ב-${r.outside.join(', ')}`}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </>)))}

      {miss.length > 0 && box(`❓ רשומים כאן ולא נמצאו (${miss.length})`, '#c2410c', miss.map(r => line(r,
        <label className="flex items-center gap-2 font-bold text-slate-700" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={!keep.has(r.tire!.id)} style={{ width: 18, height: 18 }}
            onChange={e => setKeep(k => { const n = new Set(k); if (e.target.checked) n.delete(r.tire!.id); else n.add(r.tire!.id); return n })} />
          אפס מלאי (לא נמצא)
        </label>)))}

      {diffs.length > 0 && box(`± כמות שונה מהמערכת (${diffs.length})`, '#b45309', diffs.map(r => line(r)))}
      {news.length > 0 && box(`🆕 ברקודים חדשים — ייקלטו כצמיג חדש (${news.length})`, '#7c3aed', news.map(r => line(r)))}
      {ok.length > 0 && (
        <details className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <summary className="font-black text-green-700 cursor-pointer" style={{ padding: '10px 12px', fontSize: 15 }}>✓ תקינים ({ok.length})</summary>
          {ok.map(r => line(r))}
        </details>
      )}
      {review.length === 0 && <div className="text-slate-400 text-center" style={{ padding: 20 }}>לא נסרק כלום</div>}

      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="הערות (לא חובה)"
        className="border-2 border-slate-200 rounded-xl outline-none bg-white" style={{ padding: '10px 12px', fontSize: 15 }} />
    </>, <>
      <button onClick={() => setStep('scan')} className={`${btn} bg-slate-100 text-slate-700`} style={{ padding: '14px 16px' }}>→ חזרה לסריקה</button>
      <button onClick={save} disabled={saving || review.length === 0} className={`${btn} bg-green-700 text-white flex-1`} style={{ padding: 14, fontSize: 17 }}>
        {saving ? 'שומר...' : '✓ אשר ועדכן מלאי'}
      </button>
    </>)
  }

  return frame('🔢 ספירת מלאי', (
    <div className="flex flex-col items-center gap-3 text-center" style={{ padding: '40px 0' }}>
      <span style={{ fontSize: 56 }}>✅</span>
      <div className="font-black text-slate-800" style={{ fontSize: 20 }}>הספירה נשמרה</div>
      <div className="text-slate-600">עודכנו {result?.updated ?? 0} צמיגים{result?.created ? ` · ${result.created} חדשים ממתינים לפרטים` : ''}</div>
      {round?.nextCab && (
        <button onClick={() => { reset(); start(shelvesOfCabinet(round.nextCab!)) }} className={`${btn} bg-blue-700 text-white`} style={{ padding: '14px 24px', fontSize: 17 }}>
          המשך לארון {round.nextCab.code} ←
        </button>
      )}
      <button onClick={reset} className={`${btn} ${round?.nextCab ? 'bg-slate-100 text-slate-700' : 'bg-blue-700 text-white'}`} style={{ padding: '14px 24px', fontSize: 17 }}>
        {round?.nextCab ? 'בחירה במפה' : 'ספירה נוספת'}
      </button>
    </div>
  ))
}
