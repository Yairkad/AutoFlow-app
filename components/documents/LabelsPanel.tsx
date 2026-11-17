'use client'

// מדבקות (own sidebar tab, /labels): labels for the thermal label printer (XPRINTER, 72mm continuous roll).
// Car labels (plate / make-model-year / immobilizer code = cars.car_code) as a key-tag insert or a
// full-width label; product price labels (name / price / barcode) in 4 sizes; free-text labels
// (e.g. envelope addresses) with saved designs (documents.type 'label_template'). Labels are drawn on canvas
// (lib/print/labels.ts) and sent by printer NAME through QZ Tray (lib/print/qz.ts) so the Windows
// default printer is untouched; without QZ Tray it falls back to the browser print dialog.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/contexts/ProfileContext'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import { likePatterns } from '@/lib/search/fuzzy'
import { printHtml } from '@/lib/print/printHtml'
import {
  DEFAULT_TAG, DPM, ROLL_MM, drawCarLabel, drawCustomLabel, drawProductLabel, drawTagRow, labelsPrintHtml, loadBwLogo,
  loadLabelFonts, wideCarHeight, type CarLabel, type CustomLabel, type CustomLine, type PriceSize, type ProductLabel,
  type ProductSize, type TagSize, type TextSize,
} from '@/lib/print/labels'
import { getLabelPrinter, getPrintMethod, qzConnect, qzPrintLabels, qzPrinters, setLabelPrinter, setPrintMethod, type PrintMethod } from '@/lib/print/qz'

type Mode = 'car' | 'product' | 'custom'
type CarKind = 'tag' | 'wide'
interface Prefs { tag: TagSize; carKind: CarKind; priceSize: PriceSize; productSize: ProductSize; logoCar: boolean; logoProduct: boolean }
const PREFS_KEY = 'labels.prefs'
const DEFAULT_PREFS: Prefs = { tag: DEFAULT_TAG, carKind: 'tag', priceSize: 'l', productSize: 'l', logoCar: true, logoProduct: true }
const EMPTY_CUSTOM: CustomLabel = {
  lines: [{ text: 'לכבוד', size: 'm', bold: false }, { text: '', size: 'l', bold: true }, { text: '', size: 'm', bold: false }],
  align: 'right', logo: true, frame: false,
}
interface LabelTemplate { id: string; name: string; content: CustomLabel }

/**
 * Number input that keeps what is typed (no clamping per keystroke — that jumbled the digits);
 * the value is committed whenever it's a valid number in range, and the box resets on blur.
 */
function NumField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <div>
      <label className="form-label">{label}</label>
      <input className="form-input" inputMode="decimal" dir="ltr" value={text ?? String(value)}
        onChange={e => {
          const t = e.target.value.replace(/[^\d.]/g, '')
          setText(t)
          const v = Number(t)
          if (t && v >= min && v <= max) onCommit(v)
        }}
        onBlur={() => setText(null)} />
    </div>
  )
}
const EMPTY_CAR: CarLabel = { plate: '', make: '', model: '', year: '', code: '', note: '' }
const EMPTY_PRODUCT: ProductLabel = { name: '', price: '', barcode: '', showBarcode: true }

interface CarRow { id: string; plate: string | null; make: string | null; model: string | null; year: number | null; car_code: string | null }
interface ProductRow { id: string; name: string; barcode: string | null; sku: string | null; sell_price: number | null }
interface Rendered { dataUrl: string; hmm: number }

function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } } catch { return DEFAULT_PREFS }
}

export default function LabelsPanel() {
  const [sb] = useState(createClient)
  const { profile } = useProfile()
  const { showToast } = useToast()
  const tenantId = profile?.tenantId
  const tenant = profile?.tenant as { name?: string; logo_base64?: string } | undefined
  const bizName = tenant?.name || ''

  const [mode, setMode] = useState<Mode>('car')
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS)
  const [car, setCar] = useState<CarLabel>(EMPTY_CAR)
  const [product, setProduct] = useState<ProductLabel>(EMPTY_PRODUCT)
  const [custom, setCustom] = useState<CustomLabel>(EMPTY_CUSTOM)
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [tplName, setTplName] = useState('')
  const [copies, setCopies] = useState(1)
  const [logo, setLogo] = useState<HTMLCanvasElement | null>(null)
  const [fontsReady, setFontsReady] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(CarRow | ProductRow)[]>([])
  const [showResults, setShowResults] = useState(false)

  const [qzOk, setQzOk] = useState<boolean | null>(null)
  const [printer, setPrinter] = useState('')
  const [method, setMethod] = useState<PrintMethod>('escpos')
  const [printers, setPrinters] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => { setPrefsState(loadPrefs()); setPrinter(getLabelPrinter()); setMethod(getPrintMethod()) }, 0)
    loadLabelFonts().then(() => setFontsReady(true))
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    let alive = true
    loadBwLogo(tenant?.logo_base64 || '').then(c => { if (alive) setLogo(c) })
    return () => { alive = false }
  }, [tenant?.logo_base64])

  const loadTemplates = useCallback(async () => {
    if (!tenantId) return
    const { data } = await sb.from('documents').select('id,name,content').eq('tenant_id', tenantId).eq('type', 'label_template').order('name')
    setTemplates((data ?? []) as LabelTemplate[])
  }, [sb, tenantId])
  useEffect(() => { const id = setTimeout(loadTemplates, 0); return () => clearTimeout(id) }, [loadTemplates])

  async function saveTemplate() {
    const name = tplName.trim()
    if (!name || !tenantId) { showToast('תן שם לעיצוב', 'error'); return }
    const existing = templates.find(t => t.name === name)
    const { error } = existing
      ? await sb.from('documents').update({ content: custom }).eq('id', existing.id)
      : await sb.from('documents').insert({ tenant_id: tenantId, name, type: 'label_template', content: custom })
    if (error) { showToast('שגיאה בשמירה: ' + error.message, 'error'); return }
    showToast(existing ? 'העיצוב עודכן' : 'העיצוב נשמר', 'success')
    loadTemplates()
  }
  async function deleteTemplate(t: LabelTemplate) {
    const { error } = await sb.from('documents').delete().eq('id', t.id)
    if (error) { showToast('שגיאה במחיקה: ' + error.message, 'error'); return }
    loadTemplates()
  }
  const setLine = (i: number, patch: Partial<CustomLine>) =>
    setCustom(c => ({ ...c, lines: c.lines.map((l, j) => j === i ? { ...l, ...patch } : l) }))

  const setPrefs = (p: Partial<Prefs>) => setPrefsState(prev => {
    const next = { ...prev, ...p }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  // ── QZ Tray: connect on demand (opening the settings / printing), never on page load ──
  const connect = useCallback(async () => {
    const ok = await qzConnect()
    setQzOk(ok)
    if (ok) { try { setPrinters(await qzPrinters()) } catch { setPrinters([]) } }
    return ok
  }, [])

  // ── Search cars / products ──
  useEffect(() => {
    if (!tenantId || !showResults || mode === 'custom') return
    const pats = likePatterns(query)
    const t = setTimeout(async () => {
      if (mode === 'car') {
        let q = sb.from('cars').select('id,plate,make,model,year,car_code').eq('tenant_id', tenantId)
        for (const p of pats) q = q.or(`plate.ilike.${p},make.ilike.${p},model.ilike.${p}`)
        const { data } = await q.order('created_at', { ascending: false }).limit(20)
        setResults((data ?? []) as CarRow[])
      } else {
        let q = sb.from('products').select('id,name,barcode,sku,sell_price').eq('tenant_id', tenantId)
        for (const p of pats) q = q.or(`name.ilike.${p},barcode.ilike.${p},sku.ilike.${p}`)
        const { data } = await q.order('name').limit(20)
        setResults((data ?? []) as ProductRow[])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [sb, tenantId, mode, query, showResults])

  function pick(r: CarRow | ProductRow) {
    if (mode === 'car') {
      const c = r as CarRow
      setCar({ plate: c.plate ?? '', make: c.make ?? '', model: c.model ?? '', year: c.year ? String(c.year) : '', code: c.car_code ?? '', note: '' })
    } else {
      const p = r as ProductRow
      const code = p.barcode || p.sku || ''
      setProduct({ name: p.name, price: p.sell_price != null ? String(p.sell_price) : '', barcode: code, showBarcode: !!code })
    }
    setQuery(''); setShowResults(false)
  }

  // ── Render the labels (one image per printed page) ──
  const n = Math.max(1, Math.min(50, copies || 1))
  const pages: Rendered[] = useMemo(() => {
    if (!fontsReady) return []
    const out: Rendered[] = []
    const push = (c: HTMLCanvasElement) => out.push({ dataUrl: c.toDataURL('image/png'), hmm: c.height / DPM })
    if (mode === 'custom') {
      const c = drawCustomLabel(custom, logo, bizName)
      for (let i = 0; i < n; i++) push(c)
    } else if (mode === 'product') {
      const c = drawProductLabel(product, prefs.priceSize, logo, bizName, prefs.logoProduct, prefs.productSize)
      if (prefs.productSize === 'half') {
        let left = n
        while (left > 0) { const { canvas, perRow } = drawTagRow(c, left, false); push(canvas); left -= perRow }
      } else for (let i = 0; i < n; i++) push(c)
    } else if (prefs.carKind === 'wide') {
      const c = drawCarLabel(car, ROLL_MM, wideCarHeight(car, prefs.logoCar), logo, bizName, prefs.logoCar)
      for (let i = 0; i < n; i++) push(c)
    } else {
      const tag = drawCarLabel(car, prefs.tag.w, prefs.tag.h, logo, bizName, prefs.logoCar)
      let left = n
      while (left > 0) { const { canvas, perRow } = drawTagRow(tag, left); push(canvas); left -= perRow }
    }
    return out
  }, [fontsReady, mode, product, car, custom, prefs, logo, bizName, n])

  async function print() {
    if (!pages.length) return
    setBusy(true)
    try {
      const ok = await connect()
      if (ok && printer) {
        await qzPrintLabels(printer, pages, ROLL_MM, method)
        showToast(`נשלח ל-${printer}`, 'success')
      } else {
        if (ok && !printer) showToast('לא נבחרה מדפסת מדבקות — נפתח חלון הדפסה. אפשר לבחור ב"הגדרת מדפסת"', 'info')
        printHtml(labelsPrintHtml(pages))
      }
    } catch (e) {
      showToast('שגיאה בהדפסה: ' + (e instanceof Error ? e.message : String(e)), 'error')
    } finally { setBusy(false) }
  }

  async function openSettings() {
    setSettingsOpen(true)
    await connect()
  }

  const fld = (label: string, value: string, onChange: (v: string) => void, opts: { ph?: string; ltr?: boolean; type?: string; hint?: string } = {}) => (
    <div>
      <label className="form-label">{label}{opts.hint && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> {opts.hint}</span>}</label>
      <input className="form-input" type={opts.type ?? 'text'} value={value} placeholder={opts.ph} dir={opts.ltr ? 'ltr' : undefined}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
  const seg = <T extends string>(value: T, items: [T, string][], onChange: (v: T) => void) => (
    <div className="lbl-seg">{items.map(([v, l]) => (
      <button key={v} type="button" className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
    ))}</div>
  )
  const check = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label className="lbl-chk"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} /> {label}</label>
  )

  const isCarRow = (r: CarRow | ProductRow): r is CarRow => 'plate' in r
  const tagInfo = mode === 'car' && prefs.carKind === 'tag'

  return (
    <div className="lbl-wrap">
      <style>{CSS}</style>

      <div className="lbl-bar">
        <span className={`lbl-dot ${qzOk === false ? 'off' : qzOk ? 'on' : ''}`} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{printer || 'לא נבחרה מדפסת מדבקות'}</div>
          <div className="lbl-sub">
            {qzOk === false ? 'QZ Tray לא פועל במחשב הזה — ההדפסה תיפתח בחלון ההדפסה הרגיל'
              : 'נשלח ישירות דרך QZ Tray · ברירת המחדל של Windows לא משתנה'}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={openSettings}>⚙️ הגדרת מדפסת</Button>
      </div>

      <div className="lbl-grid">
        <div className="lbl-card">
          <div className="lbl-tabs">
            {([['car', '🚗 פרטי רכב'], ['product', '📦 מחיר מוצר'], ['custom', '✏️ עיצוב אישי']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setResults([]); setQuery('') }}>{l}</button>
            ))}
          </div>
          <div className="lbl-body">
            {mode === 'car' && <>
              <label className="form-label">סוג מדבקה</label>
              {seg(prefs.carKind, [['tag', '🔑 מחזיק מפתחות'], ['wide', 'מדבקה רחבה (72 מ״מ)']], v => setPrefs({ carKind: v }))}
              {prefs.carKind === 'tag' && <>
                <div className="lbl-row">
                  <NumField label="רוחב החלון במחזיק (מ״מ)" value={prefs.tag.w} min={15} max={72} onCommit={w => setPrefs({ tag: { ...prefs.tag, w } })} />
                  <NumField label="גובה החלון במחזיק (מ״מ)" value={prefs.tag.h} min={10} max={120} onCommit={h => setPrefs({ tag: { ...prefs.tag, h } })} />
                </div>
                <div className="lbl-hint">מודפס עם מסגרת חיתוך מקווקוות; כמה מחזיקים בשורה כשנכנסים ברוחב הגליל. המידה נשמרת במחשב הזה.</div>
              </>}
            </>}

            {mode !== 'custom' && <>
            <label className="form-label" style={{ marginTop: 14 }}>{mode === 'car' ? 'בחירת רכב מהמערכת' : 'בחירת מוצר מהמלאי'}</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" value={query} placeholder={mode === 'car' ? 'חיפוש לפי מספר רכב / יצרן / דגם…' : 'חיפוש לפי שם / ברקוד / מק״ט…'}
                onChange={e => { setQuery(e.target.value); setShowResults(true) }}
                onFocus={() => setShowResults(true)} onBlur={() => setTimeout(() => setShowResults(false), 150)} />
              {showResults && results.length > 0 && (
                <div className="lbl-results">
                  {results.map(r => (
                    <button key={r.id} type="button" onMouseDown={() => pick(r)}>
                      {isCarRow(r)
                        ? <><span><span className="lbl-plate">{r.plate}</span> {[r.make, r.model, r.year].filter(Boolean).join(' ')}</span><small>{r.car_code ? 'קוד: ' + r.car_code : ''}</small></>
                        : <><span>{r.name}</span><small>{r.sell_price != null ? '₪' + r.sell_price : ''}</small></>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="lbl-hint">או מלא ידנית למטה</div>
            </>}

            {mode === 'custom' && <>
              {templates.length > 0 && <>
                <label className="form-label">עיצובים שמורים</label>
                <div className="lbl-tpls">
                  {templates.map(t => (
                    <span key={t.id} className="lbl-tpl">
                      <button type="button" onClick={() => { setCustom({ ...EMPTY_CUSTOM, ...t.content }); setTplName(t.name) }}>{t.name}</button>
                      <button type="button" className="x" title="מחיקה" onClick={() => deleteTemplate(t)}>✕</button>
                    </span>
                  ))}
                </div>
              </>}
              <div className="lbl-sec" style={{ marginTop: 6 }}>שורות</div>
              {custom.lines.map((l, i) => (
                <div key={i} className="lbl-line">
                  <input className="form-input" value={l.text} placeholder={`שורה ${i + 1}`} onChange={e => setLine(i, { text: e.target.value })} />
                  <select className="form-input" value={l.size} aria-label="גודל" onChange={e => setLine(i, { size: e.target.value as TextSize })}>
                    <option value="s">קטן</option><option value="m">בינוני</option><option value="l">גדול</option><option value="xl">ענק</option>
                  </select>
                  <button type="button" className={`lbl-b ${l.bold ? 'on' : ''}`} title="מודגש" onClick={() => setLine(i, { bold: !l.bold })}>B</button>
                  <button type="button" className="lbl-b" title="מחיקת שורה" disabled={custom.lines.length < 2}
                    onClick={() => setCustom(c => ({ ...c, lines: c.lines.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setCustom(c => ({ ...c, lines: [...c.lines, { text: '', size: 'm', bold: false }] }))}>+ שורה</Button>
              <label className="form-label" style={{ marginTop: 12 }}>יישור</label>
              {seg(custom.align, [['right', 'לימין'], ['center', 'למרכז']], v => setCustom(c => ({ ...c, align: v })))}
              {check('לוגו העסק בראש המדבקה', custom.logo, v => setCustom(c => ({ ...c, logo: v })))}
              {check('מסגרת', custom.frame, v => setCustom(c => ({ ...c, frame: v })))}
              <div className="lbl-sec">שמירה לשימוש חוזר</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input className="form-input" value={tplName} placeholder="שם העיצוב (למשל: מעטפה לרו״ח)" onChange={e => setTplName(e.target.value)} />
                <Button size="sm" onClick={saveTemplate}>💾 שמירה</Button>
              </div>
              <div className="lbl-hint">שמירה בשם קיים מעדכנת אותו.</div>
            </>}

            {mode !== 'custom' && <div className="lbl-sec">תוכן המדבקה</div>}
            {mode === 'car' ? <>
              <div className="lbl-row">
                {fld('מספר רכב', car.plate, v => setCar({ ...car, plate: v }), { ltr: true })}
                {fld('קוד קודן', car.code, v => setCar({ ...car, code: v }), { ltr: true, hint: '(לא חובה)' })}
              </div>
              <div className="lbl-row">
                {fld('יצרן', car.make, v => setCar({ ...car, make: v }))}
                {fld('דגם', car.model, v => setCar({ ...car, model: v }))}
              </div>
              <div className="lbl-row">
                {fld('שנה', car.year, v => setCar({ ...car, year: v }))}
                {fld('הערה קצרה', car.note, v => setCar({ ...car, note: v }), { hint: '(לא חובה)', ph: 'למשל: מפתח רזרבי' })}
              </div>
              {check('לוגו העסק בראש המדבקה', prefs.logoCar, v => setPrefs({ logoCar: v }))}
              <div className="lbl-hint">שורה ריקה (למשל אין קוד קודן) פשוט לא מודפסת.</div>
            </> : mode === 'product' ? <>
              <label className="form-label">גודל מדבקה</label>
              {seg(prefs.productSize, [['l', 'גדול'], ['m', 'בינוני'], ['s', 'קטן'], ['half', 'חצי רוחב · 2 בשורה']], v => setPrefs({ productSize: v }))}
              {fld('שם מוצר', product.name, v => setProduct({ ...product, name: v }))}
              <div className="lbl-row">
                {fld('מחיר (₪)', product.price, v => setProduct({ ...product, price: v }), { type: 'number' })}
                {fld('ברקוד', product.barcode, v => setProduct({ ...product, barcode: v }), { ltr: true })}
              </div>
              {check('להדפיס ברקוד', product.showBarcode, v => setProduct({ ...product, showBarcode: v }))}
              {check('לוגו העסק בראש המדבקה', prefs.logoProduct, v => setPrefs({ logoProduct: v }))}
              <label className="form-label" style={{ marginTop: 12 }}>גודל המחיר</label>
              {seg(prefs.priceSize, [['m', 'רגיל'], ['l', 'גדול'], ['xl', 'ענק']], v => setPrefs({ priceSize: v }))}
            </> : null}
            {!logo && <div className="lbl-hint" style={{ marginTop: 8 }}>אין לוגו בהגדרות העסק — יודפס שם העסק במקומו.</div>}
          </div>
        </div>

        <div className="lbl-card">
          <div className="lbl-prevhead"><b>תצוגה מקדימה — גודל אמיתי</b><span className="lbl-hint" style={{ margin: 0 }}>רוחב {ROLL_MM} מ״מ · גליל רציף</span></div>
          <div className="lbl-stage">
            {pages.slice(0, 3).map((p, i) => (
              <div key={i} style={{ display: 'contents' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="lbl-paper" style={{ height: `${p.hmm}mm` }} />
                <div className="lbl-cut" />
              </div>
            ))}
            {pages.length > 3 && <div className="lbl-hint">+ עוד {pages.length - 3}</div>}
          </div>
          <div className="lbl-meta">
            <span>{tagInfo ? `מחזיק ${prefs.tag.w}×${prefs.tag.h} מ״מ` : mode === 'product' && prefs.productSize === 'half' ? `34 × ${Math.round((pages[0]?.hmm ?? 2) - 2)} מ״מ · 2 בשורה` : `${ROLL_MM} × ${Math.round(pages[0]?.hmm ?? 0)} מ״מ`}</span>
            <span>שחור-לבן (הדפסה תרמית)</span>
          </div>
          <div className="lbl-foot">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>כמות עותקים</span>
              <div className="lbl-qty">
                <button type="button" onClick={() => setCopies(Math.max(1, n - 1))}>−</button>
                <input className="form-input" type="number" value={copies} min={1} max={50} onChange={e => setCopies(+e.target.value)} />
                <button type="button" onClick={() => setCopies(Math.min(50, n + 1))}>+</button>
              </div>
            </div>
            <Button size="lg" fullWidth loading={busy} onClick={print}>🖨 הדפס מדבקה</Button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="lbl-modal-bg" onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}>
          <div className="lbl-modal">
            <h3>⚙️ מדפסת מדבקות</h3>
            <div style={{ padding: '6px 18px 18px' }}>
              {qzOk === null && <div className="lbl-hint">מתחבר ל-QZ Tray…</div>}
              {qzOk === false && (
                <div className="lbl-warn">
                  QZ Tray לא פועל במחשב הזה. התקן והפעל אותו, ואז לחץ ״נסה שוב״.
                  <div style={{ marginTop: 6 }}><a href="https://qz.io/download/" target="_blank" rel="noreferrer">הורדת QZ Tray (חינמי) ↗</a></div>
                </div>
              )}
              {qzOk && <>
                <div className="lbl-hint" style={{ marginTop: 10 }}>בחר את המדפסת שאליה יישלחו המדבקות. ההגדרה נשמרת במחשב הזה בלבד; שאר ההדפסות ממשיכות למדפסת הרגילה.</div>
                <div className="lbl-plist">
                  {printers.map(p => (
                    <button key={p} type="button" className={p === printer ? 'on' : ''} onClick={() => { setPrinter(p); setLabelPrinter(p) }}>
                      {/xprinter|xp-|label|pos|80|58/i.test(p) ? '🏷️' : '🖨'} {p}
                    </button>
                  ))}
                  {!printers.length && <div className="lbl-hint">לא נמצאו מדפסות.</div>}
                </div>
                <label className="form-label" style={{ marginTop: 14 }}>שיטת הדפסה</label>
                {seg(method, [['escpos', 'ישירה (ESC/POS) — מומלץ'], ['driver', 'דרך הדרייבר']], v => { setMethod(v); setPrintMethod(v) })}
                <div className="lbl-hint">ישירה: מודפס בגודל מדויק (72 מ״מ) וחותך אחרי כל מדבקה. ״דרך הדרייבר״ — רק אם הישירה לא מדפיסה כלום.</div>
              </>}
              <div className="lbl-steps"><b>התקנה חד-פעמית במחשב</b>
                <ol>
                  <li>להתקין את הדרייבר של XPRINTER ולוודא שהמדפסת מופיעה ב-Windows</li>
                  <li>להתקין את <a href="https://qz.io/download/" target="_blank" rel="noreferrer">QZ Tray</a> ולהפעיל אותו (אייקון ליד השעון)</li>
                  <li><b>כדי שלא יבקש אישור בכל הדפסה:</b> <a href="/api/qz/cert?download=1">להוריד את קובץ האישור (override.crt)</a> ולהעתיק אותו לתיקייה <code dir="ltr">C:\Program Files\QZ Tray</code></li>
                  <li>לסגור את QZ Tray (קליק ימני על האייקון ← Exit) ולפתוח מחדש</li>
                  <li>בהדפסה הבאה יופיע אישור אחד — לסמן ״Remember this decision״ וללחוץ Allow. מאז — בלי שאלות.</li>
                </ol>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {qzOk === false && <Button size="sm" onClick={connect}>נסה שוב</Button>}
                {qzOk && printer && <Button size="sm" variant="secondary" loading={busy} onClick={print}>הדפסת ניסיון</Button>}
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(false)}>סגור</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.lbl-wrap{max-width:1150px}
.lbl-bar{display:flex;align-items:center;gap:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;box-shadow:var(--shadow);flex-wrap:wrap}
.lbl-dot{width:9px;height:9px;border-radius:50%;background:var(--text-muted);flex:none}
.lbl-dot.on{background:var(--success);box-shadow:0 0 0 3px var(--success-soft)}
.lbl-dot.off{background:var(--danger);box-shadow:0 0 0 3px var(--danger-soft)}
.lbl-sub{color:var(--text-muted);font-size:12.5px}
.lbl-grid{display:grid;grid-template-columns:1fr 420px;gap:14px;align-items:start}
@media(max-width:900px){.lbl-grid{grid-template-columns:1fr}}
.lbl-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.lbl-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 10px}
.lbl-tabs button{padding:13px 16px;font:inherit;font-weight:600;color:var(--text-muted);background:none;border:0;border-bottom:2.5px solid transparent;margin-bottom:-1px;cursor:pointer}
.lbl-tabs button.on{color:var(--primary);border-color:var(--primary)}
.lbl-body{padding:16px}
.lbl-body .form-label{margin-top:10px}
.lbl-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lbl-hint{font-size:12px;color:var(--text-muted);margin-top:4px}
.lbl-sec{font-weight:700;margin:16px 0 0;padding-top:12px;border-top:1px dashed var(--border);font-size:13px;color:var(--primary)}
.lbl-seg{display:inline-flex;background:var(--bg);border-radius:8px;padding:3px;gap:2px}
.lbl-seg button{padding:5px 12px;border-radius:6px;border:0;background:none;font:inherit;font-weight:600;font-size:13px;color:var(--text-muted);cursor:pointer}
.lbl-seg button.on{background:var(--bg-card);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lbl-chk{display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;user-select:none}
.lbl-chk input{width:17px;height:17px;accent-color:var(--primary)}
.lbl-results{position:absolute;inset-inline:0;top:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow);z-index:5;max-height:260px;overflow:auto}
.lbl-results button{display:flex;justify-content:space-between;gap:10px;width:100%;padding:9px 12px;border:0;background:none;font:inherit;text-align:start;cursor:pointer;color:var(--text)}
.lbl-results button:hover{background:var(--bg-soft)}
.lbl-results small{color:var(--text-muted)}
.lbl-plate{font-family:var(--font-num);background:var(--highlight);border-radius:4px;padding:1px 7px;font-weight:700;direction:ltr;display:inline-block}
.lbl-prevhead{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}
.lbl-stage{background:repeating-linear-gradient(45deg,#e9ebf1,#e9ebf1 8px,#eef0f5 8px,#eef0f5 16px);padding:22px 0;display:flex;flex-direction:column;align-items:center;min-height:220px}
.lbl-paper{display:block;width:${ROLL_MM}mm;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.lbl-cut{width:80mm;border-top:1.5px dashed #9aa1b3;margin:6px 0}
.lbl-meta{font-size:12px;color:var(--text-muted);padding:10px 16px;display:flex;justify-content:space-between;border-top:1px solid var(--border)}
.lbl-foot{padding:14px 16px;border-top:1px solid var(--border);display:grid;gap:10px}
.lbl-qty{display:flex;align-items:center;gap:8px}
.lbl-qty button{width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);font-size:18px;cursor:pointer}
.lbl-qty input{width:64px;text-align:center}
.lbl-modal-bg{position:fixed;inset:0;background:rgba(20,26,46,.45);display:flex;align-items:center;justify-content:center;z-index:1000}
.lbl-modal{background:var(--bg-card);border-radius:14px;width:min(520px,94vw);max-height:90vh;overflow:auto}
.lbl-modal h3{margin:0;padding:16px 18px;border-bottom:1px solid var(--border);font-size:16px}
.lbl-plist{display:grid;gap:8px;margin-top:10px}
.lbl-plist button{border:1px solid var(--border);border-radius:8px;padding:10px 12px;background:var(--bg-card);font:inherit;text-align:start;cursor:pointer;color:var(--text)}
.lbl-plist button.on{border-color:var(--primary);background:var(--primary-soft);font-weight:700}
.lbl-steps{background:var(--bg-soft);border-radius:8px;padding:10px 14px;margin-top:14px;font-size:13px;line-height:1.7}
.lbl-steps ol{margin:4px 0 0;padding-inline-start:18px}
.lbl-tpls{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.lbl-tpl{display:inline-flex;border:1px solid var(--border);border-radius:20px;overflow:hidden}
.lbl-tpl button{border:0;background:var(--bg-card);font:inherit;font-size:13px;padding:5px 10px;cursor:pointer;color:var(--text)}
.lbl-tpl button:hover{background:var(--primary-soft)}
.lbl-tpl .x{color:var(--text-muted);padding:5px 8px;border-inline-start:1px solid var(--border)}
.lbl-line{display:grid;grid-template-columns:1fr 92px 34px 34px;gap:6px;margin-top:8px}
.lbl-b{border:1px solid var(--border);border-radius:8px;background:var(--bg-card);font-weight:800;cursor:pointer;color:var(--text)}
.lbl-b.on{background:var(--primary);color:#fff;border-color:var(--primary)}
.lbl-b:disabled{opacity:.4;cursor:default}
.lbl-warn{background:var(--warning-soft);color:var(--warning);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px}
`
