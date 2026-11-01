'use client'

// Documents → ייפוי כוח: the official Ministry of Transport PDF as the background with
// transparent fields on top. Calibration mode drags / nudges every field (saved per tenant);
// owners and proxies are kept in quick-fill lists. Print only — filled forms aren't stored.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import Button from '@/components/ui/Button'
import {
  FIELDS, FIELD_BY_ID, PAGE_W, PAGE_H, emptyLayout, emptyPerson, fieldBox, fieldValue, fmtDMY, idDigits,
  newPoa, poaPrintHtml, renderPoaBackground,
  type FieldBox, type Person, type PoaData, type PoaLayout, type SavedPerson,
} from '@/lib/forms/poaForm'
import { printHtml } from '@/lib/print/printHtml'

type ListKey = 'proxies' | 'owners'

const SAMPLE: Record<string, string> = {
  plate: '12-345-67', other_text: 'פירוט הפעולה', proxy_name: 'שם מיופה הכוח',
  proxy_id: '123456789', valid_until: '31/12/2026',
  owner0_name: 'שם בעלים', owner1_name: 'שם בעלים', owner2_name: 'שם בעלים',
  owner0_id: '123456789', owner1_id: '123456789', owner2_id: '123456789',
  mark_sell: 'X', mark_buy: 'X', mark_other: 'X',
}

export default function PowerOfAttorneyPanel() {
  const [sb] = useState(createClient)
  const { profile } = useProfile()
  const { showToast } = useToast()
  const { confirm } = useConfirm()
  const tenantId = profile?.tenantId

  const [bg, setBg]           = useState<string | null>(null)
  const [bgError, setBgError] = useState(false)
  const [data, setData]       = useState<PoaData>(newPoa)
  const [layout, setLayout]   = useState<PoaLayout>(emptyLayout)
  const [savedLayout, setSavedLayout] = useState<string>(JSON.stringify(emptyLayout()))
  const [lists, setLists]     = useState<Record<ListKey, SavedPerson[]>>({ proxies: [], owners: [] })
  const [calib, setCalib]     = useState(false)
  const [sel, setSel]         = useState<string | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  const [sheetW, setSheetW] = useState(800)
  const scale = sheetW / PAGE_W
  const layoutDirty = JSON.stringify(layout) !== savedLayout

  // ── load: PDF background + tenant settings ──
  useEffect(() => {
    renderPoaBackground(3).then(setBg).catch(() => setBgError(true))
  }, [])

  useEffect(() => {
    if (!tenantId) return
    sb.from('poa_form_settings').select('layout, proxies, owners').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data: s }) => {
        if (!s) return
        const l = { ...emptyLayout(), ...((s.layout as PoaLayout | null) ?? {}) }
        setLayout(l); setSavedLayout(JSON.stringify(l))
        setLists({ proxies: (s.proxies as SavedPerson[]) ?? [], owners: (s.owners as SavedPerson[]) ?? [] })
      })
  }, [sb, tenantId])

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSheetW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    if (!tenantId) return false
    const { error } = await sb.from('poa_form_settings')
      .upsert({ tenant_id: tenantId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    if (error) { showToast('שגיאה בשמירה — ייתכן שמיגרציה 099 עדיין לא הורצה', 'error'); return false }
    return true
  }, [sb, tenantId, showToast])

  // ── data editing ──
  function setField(id: string, v: string) {
    setData(d => {
      const owner = id.match(/^owner(\d)_(id|name)$/)
      if (owner) {
        const owners = d.owners.map((p, i) => i === +owner[1] ? { ...p, [owner[2] === 'id' ? 'idNum' : 'name']: v } : p)
        return { ...d, owners }
      }
      switch (id) {
        case 'plate':       return { ...d, plate: v }
        case 'other_text':  return { ...d, otherText: v, action: v ? 'other' : d.action }
        case 'proxy_id':    return { ...d, proxy: { ...d.proxy, idNum: v } }
        case 'proxy_name':  return { ...d, proxy: { ...d.proxy, name: v } }
        case 'valid_until': return { ...d, validUntil: v }
      }
      return d
    })
  }
  function toggleMark(id: string) {
    const a = id.replace('mark_', '') as PoaData['action']
    setData(d => ({ ...d, action: d.action === a ? '' : a }))
  }
  function rawValue(id: string): string {
    const owner = id.match(/^owner(\d)_(id|name)$/)
    if (owner) return owner[2] === 'id' ? data.owners[+owner[1]].idNum : data.owners[+owner[1]].name
    if (id === 'other_text') return data.otherText
    if (id === 'valid_until') return data.validUntil
    return fieldValue(data, id)
  }

  // ── quick-fill lists ──
  const personAt = (slot: string): Person => slot === 'proxy' ? data.proxy : data.owners[+slot]
  function setPerson(slot: string, p: Person) {
    setData(d => slot === 'proxy' ? { ...d, proxy: p } : { ...d, owners: d.owners.map((o, i) => i === +slot ? p : o) })
  }
  const listOf = (slot: string): ListKey => slot === 'proxy' ? 'proxies' : 'owners'
  const matchId = (slot: string) => {
    const p = personAt(slot)
    return lists[listOf(slot)].find(s => s.name === p.name && s.idNum === p.idNum)?.id ?? ''
  }

  async function saveToList(slot: string) {
    const p = personAt(slot)
    if (!p.name.trim()) { showToast('יש למלא שם לפני השמירה', 'info'); return }
    const key = listOf(slot)
    const cur = lists[key]
    const same = cur.find(s => (p.idNum && s.idNum === p.idNum) || s.name === p.name.trim())
    const next = same
      ? cur.map(s => s.id === same.id ? { ...s, name: p.name.trim(), idNum: p.idNum } : s)
      : [...cur, { id: crypto.randomUUID(), name: p.name.trim(), idNum: p.idNum }]
    if (await saveSettings({ [key]: next })) {
      setLists(l => ({ ...l, [key]: next }))
      showToast(same ? 'הפרטים עודכנו ברשימה' : 'נשמר ברשימה', 'success')
    }
  }
  async function removeFromList(slot: string, id: string) {
    const key = listOf(slot)
    const item = lists[key].find(s => s.id === id)
    if (!item) return
    const ok = await confirm({ msg: `למחוק את "${item.name}" מהרשימה?`, confirmLabel: 'מחק', variant: 'danger' })
    if (!ok) return
    const next = lists[key].filter(s => s.id !== id)
    if (await saveSettings({ [key]: next })) setLists(l => ({ ...l, [key]: next }))
  }

  // ── calibration ──
  const box = (id: string) => fieldBox(layout, id)
  function patchBox(id: string, p: Partial<FieldBox>) {
    setLayout(l => ({ ...l, fields: { ...l.fields, [id]: { ...(l.fields[id] ?? {}), ...p } } }))
  }
  const round = (n: number) => Math.round(n * 10) / 10

  useEffect(() => {
    if (!calib || !sel) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const step = e.shiftKey ? 5 : 0.5
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (!d) return
      e.preventDefault()
      setLayout(l => {
        const f = { ...FIELD_BY_ID[sel], ...(l.fields[sel] ?? {}) }
        return { ...l, fields: { ...l.fields, [sel]: { ...(l.fields[sel] ?? {}), x: round(f.x + d[0]), y: round(f.y + d[1]) } } }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calib, sel])

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault()
    setSel(id)
    const start = { cx: e.clientX, cy: e.clientY, ...box(id) }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => patchBox(id, {
      x: round(start.x + (ev.clientX - start.cx) / scale),
      y: round(start.y + (ev.clientY - start.cy) / scale),
    })
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  async function saveLayout() {
    setSavingLayout(true)
    if (await saveSettings({ layout })) { setSavedLayout(JSON.stringify(layout)); showToast('הכיול נשמר', 'success') }
    setSavingLayout(false)
  }
  async function exitCalib() {
    if (layoutDirty) {
      const ok = await confirm({ msg: 'יש שינויי כיול שלא נשמרו. לצאת בלי לשמור?', confirmLabel: 'צא בלי לשמור', variant: 'danger' })
      if (!ok) return
      setLayout(JSON.parse(savedLayout))
    }
    setCalib(false); setSel(null)
  }

  // ── print ──
  function handlePrint() {
    if (!bg) { showToast('הטופס עדיין נטען', 'info'); return }
    printHtml(poaPrintHtml(bg, layout, data))
  }
  async function handleClear() {
    const ok = await confirm({ msg: 'לנקות את כל השדות בטופס?', confirmLabel: 'נקה' })
    if (ok) setData(newPoa())
  }

  // ── render ──
  const px = (pt: number) => pt * scale

  function renderField(id: string) {
    const f = box(id)
    const pos: React.CSSProperties = {
      position: 'absolute', left: px(f.x + layout.offsetX * 72 / 25.4), top: px(f.y + layout.offsetY * 72 / 25.4),
      width: px(f.w), height: px(f.h), fontSize: px(f.fs), lineHeight: `${px(f.h)}px`,
      fontFamily: 'Arial, sans-serif', color: '#000',
    }

    if (calib) {
      const v = fieldValue(data, id) || SAMPLE[id] || ''
      const isSel = sel === id
      return (
        <div key={id} dir="ltr" onPointerDown={e => startDrag(e, id)} title={f.label}
          style={{
            ...pos, cursor: 'move', touchAction: 'none', userSelect: 'none', boxSizing: 'border-box',
            outline: isSel ? '2px solid #dc2626' : '1px dashed #2563eb',
            background: isSel ? 'rgba(220,38,38,.10)' : 'rgba(37,99,235,.08)',
            color: fieldValue(data, id) ? '#000' : '#64748b',
            display: 'flex', justifyContent: f.kind === 'digits' ? 'stretch' : f.align === 'center' || f.kind === 'mark' ? 'center' : f.align === 'left' ? 'flex-start' : 'flex-end',
            overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: f.kind === 'mark' ? 700 : 400,
          }}>
          {f.kind === 'digits'
            ? idDigits(v, f.boxes ?? 9).map((c, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{c}</span>)
            : <span dir={f.ltr ? 'ltr' : 'rtl'}>{v}</span>}
        </div>
      )
    }

    const hover = 'poa-field'
    if (f.kind === 'mark') {
      const on = !!fieldValue(data, id)
      return (
        <button key={id} type="button" className={hover} onClick={() => toggleMark(id)} title={f.label}
          style={{ ...pos, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}>
          {on ? 'X' : ''}
        </button>
      )
    }
    if (f.kind === 'digits') {
      const raw = rawValue(id)
      return (
        <div key={id} dir="ltr" className={hover} style={{ ...pos, display: 'flex' }}>
          {idDigits(raw, f.boxes ?? 9).map((c, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{c}</span>)}
          <input aria-label={f.label} inputMode="numeric" value={raw}
            onChange={e => setField(id, e.target.value.replace(/\D/g, '').slice(0, f.boxes ?? 9))}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'text', border: 'none' }} />
        </div>
      )
    }
    if (id === 'valid_until') {
      return (
        <div key={id} className={hover} style={{ ...pos, textAlign: 'center' }}>
          <span dir="ltr">{fmtDMY(data.validUntil)}</span>
          <input type="date" aria-label={f.label} value={data.validUntil}
            onChange={e => setField(id, e.target.value)}
            onClick={e => { try { e.currentTarget.showPicker() } catch {} }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }} />
        </div>
      )
    }
    return (
      <input key={id} className={hover} aria-label={f.label} placeholder={f.label} dir={f.ltr ? 'ltr' : 'rtl'}
        value={rawValue(id)} onChange={e => setField(id, e.target.value)}
        style={{ ...pos, padding: 0, border: 'none', background: 'transparent', textAlign: f.align ?? 'right', outline: 'none' }} />
    )
  }

  function renderPicker(slot: string, label: string) {
    const key = listOf(slot)
    const cur = matchId(slot)
    return (
      <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 68 }}>{label}</span>
        <select value={cur} onChange={e => {
            const s = lists[key].find(x => x.id === e.target.value)
            setPerson(slot, s ? { name: s.name, idNum: s.idNum } : emptyPerson())
          }}
          style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13, background: '#fff' }}>
          <option value="">{personAt(slot).name && !cur ? `${personAt(slot).name} (לא שמור)` : '— בחר מהרשימה —'}</option>
          {lists[key].map(s => <option key={s.id} value={s.id}>{s.name}{s.idNum ? ` · ${s.idNum}` : ''}</option>)}
        </select>
        {cur
          ? <button type="button" title="מחק מהרשימה" onClick={() => removeFromList(slot, cur)} style={iconBtn}>🗑</button>
          : <button type="button" title="שמור ברשימה" onClick={() => saveToList(slot)} style={iconBtn}>⭐</button>}
      </div>
    )
  }

  const selBox = sel ? box(sel) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .poa-field { border-radius: 2px; transition: background .12s }
        .poa-field:hover, .poa-field:focus, .poa-field:focus-within { background: rgba(37,99,235,.10) !important }
        .poa-field::placeholder { color: rgba(37,99,235,.45); font-size: .8em }
      `}</style>

      {/* toolbar */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>ייפוי כוח – משרד התחבורה</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {calib ? 'גרור שדה או בחר אותו והזז עם החצים (Shift = צעד גדול). השדות מוצגים עם טקסט לדוגמה.'
                : 'ממלאים ישירות על הטופס, או בוחרים בעלים ומיופה כוח מהרשימות. החתימה – ביד אחרי ההדפסה.'}
            </div>
          </div>
          {calib ? <>
            <Button variant="ghost" size="sm" onClick={exitCalib}>סיום כיול</Button>
            <Button size="sm" onClick={saveLayout} disabled={!layoutDirty || savingLayout}>{savingLayout ? 'שומר…' : 'שמור כיול'}</Button>
          </> : <>
            <Button variant="ghost" size="sm" onClick={handleClear}>נקה</Button>
            <Button variant="outline" size="sm" onClick={() => setCalib(true)}>כיול שדות</Button>
            <Button size="sm" onClick={handlePrint} disabled={!bg}>הדפס</Button>
          </>}
        </div>

        {!calib && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            {renderPicker('proxy', 'מיופה כוח')}
            {renderPicker('0', 'בעלים 1')}
            {renderPicker('1', 'בעלים 2')}
            {renderPicker('2', 'בעלים 3')}
          </div>
        )}

        {calib && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', fontSize: 12 }}>
            <label style={calLabel}>שדה
              <select value={sel ?? ''} onChange={e => setSel(e.target.value || null)} style={{ ...numIn, width: 170 }}>
                <option value="">— בחר שדה —</option>
                {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            {selBox && sel && <>
              {([['x', 'אופקי (X)'], ['y', 'אנכי (Y)'], ['w', 'רוחב'], ['h', 'גובה'], ['fs', 'גודל גופן']] as const).map(([k, l]) => (
                <label key={k} style={calLabel}>{l}
                  <input type="number" step={0.5} value={selBox[k]} dir="ltr"
                    onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) patchBox(sel, { [k]: n }) }} style={numIn} />
                </label>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setLayout(l => { const f = { ...l.fields }; delete f[sel]; return { ...l, fields: f } })}>איפוס שדה</Button>
            </>}
            <span style={{ flex: 1 }} />
            <label style={calLabel} title="הזזת כל הטופס בהדפסה, אם המדפסת מזיזה">הזזת הדפסה ימינה (מ״מ)
              <input type="number" step={0.5} value={layout.offsetX} dir="ltr" onChange={e => setLayout(l => ({ ...l, offsetX: parseFloat(e.target.value) || 0 }))} style={numIn} />
            </label>
            <label style={calLabel}>הזזת הדפסה למטה (מ״מ)
              <input type="number" step={0.5} value={layout.offsetY} dir="ltr" onChange={e => setLayout(l => ({ ...l, offsetY: parseFloat(e.target.value) || 0 }))} style={numIn} />
            </label>
            <Button variant="ghost" size="sm" onClick={async () => {
              if (await confirm({ msg: 'להחזיר את כל השדות למיקום ברירת המחדל?', confirmLabel: 'איפוס', variant: 'danger' })) { setLayout(emptyLayout()); setSel(null) }
            }}>איפוס הכל</Button>
          </div>
        )}
      </div>

      {/* the sheet */}
      <div style={{ overflowX: 'auto' }}>
        <div ref={sheetRef} onPointerDown={e => { if (calib && e.target === e.currentTarget) setSel(null) }}
          style={{
            position: 'relative', width: '100%', maxWidth: 860, margin: '0 auto', aspectRatio: `${PAGE_W} / ${PAGE_H}`,
            background: '#fff', boxShadow: '0 2px 14px rgba(0,0,0,.12)', borderRadius: 4, overflow: 'hidden',
          }}>
          {bg
            // eslint-disable-next-line @next/next/no-img-element -- local data URL rendered from the PDF
            ? <img src={bg} alt="ייפוי כוח" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                {bgError ? 'שגיאה בטעינת הטופס' : 'טוען טופס…'}
              </div>}
          {bg && FIELDS.map(f => renderField(f.id))}
        </div>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  border: '1px solid var(--border)', background: '#fff', borderRadius: 7, width: 30, height: 30,
  cursor: 'pointer', fontSize: 14, flexShrink: 0,
}
const calLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--text-muted)' }
const numIn: React.CSSProperties = {
  width: 78, padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13,
}
