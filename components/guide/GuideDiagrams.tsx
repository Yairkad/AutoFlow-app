import type { DiagramKey, Lang } from '@/lib/guide/content'

// Hand-drawn explanatory diagrams for the public guide (our own artwork — no image licensing).

const INK = '#1e293b', OK = '#16a34a', BAD = '#dc2626', AXIS = '#2563eb', ROAD = '#94a3b8', BODY = '#e2e8f0'

const t = (lang: Lang, he: string, en: string) => (lang === 'en' ? en : he)

function Row({ items }: { items: { svg: React.ReactNode; label: string }[] }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', gap: 6, background: '#f8fafc', borderRadius: 12, padding: '10px 6px', margin: '10px 0' }}>
      {items.map((it, i) => (
        <div key={i} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
          {it.svg}<div style={{ marginTop: 4 }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Top view: car body + two front wheels rotated by `deg` (positive = fronts point inward). */
function ToeSvg({ deg, color }: { deg: number; color: string }) {
  return (
    <svg width="92" height="70" viewBox="0 0 92 70" aria-hidden>
      <rect x="30" y="8" width="32" height="54" rx="6" fill={BODY} />
      <g transform={`rotate(${deg} 16 35)`}><rect x="10" y="17" width="12" height="36" rx="4" fill={color} /></g>
      <g transform={`rotate(${-deg} 76 35)`}><rect x="70" y="17" width="12" height="36" rx="4" fill={color} /></g>
      <path d="M46 2 l-4 6 h8z" fill={AXIS} />
    </svg>
  )
}

/** Front view: wheel tilted by `deg` on the road with a vertical reference line. */
function CamberSvg({ deg, color }: { deg: number; color: string }) {
  return (
    <svg width="80" height="64" viewBox="0 0 80 64" aria-hidden>
      <line x1="0" y1="60" x2="80" y2="60" stroke={ROAD} strokeWidth="2" />
      <g transform={`rotate(${deg} 40 58)`}><rect x="32" y="10" width="16" height="48" rx="4" fill={color} /></g>
      {deg !== 0 && <line x1="40" y1="4" x2="40" y2="60" stroke={AXIS} strokeDasharray="3 3" />}
    </svg>
  )
}

/** Side view: wheel with the steering axis tilted by `deg` (positive = top leans back). */
function CasterSvg({ deg, color }: { deg: number; color: string }) {
  return (
    <svg width="84" height="70" viewBox="0 0 84 70" aria-hidden>
      <line x1="0" y1="66" x2="84" y2="66" stroke={ROAD} strokeWidth="2" />
      <circle cx="42" cy="44" r="21" fill={color} /><circle cx="42" cy="44" r="8" fill="#cbd5e1" />
      <g transform={`rotate(${deg} 42 44)`}><line x1="42" y1="2" x2="42" y2="66" stroke={AXIS} strokeWidth="2.5" /></g>
      <line x1="42" y1="2" x2="42" y2="66" stroke="#64748b" strokeDasharray="3 3" />
      {/* direction of travel */}
      <path d="M4 10 h14 M4 10 l5 -4 M4 10 l5 4" stroke="#64748b" strokeWidth="2" fill="none" />
    </svg>
  )
}

function SizeSvg({ lang }: { lang: Lang }) {
  const parts: [string, string, string, string][] = [
    ['205', '#2563eb', 'רוחב', 'width'], ['55', '#7c3aed', 'גובה', 'height'], ['R', '#0891b2', 'רדיאלי', 'radial'],
    ['16', '#16a34a', 'חישוק', 'rim'], ['91', '#ea580c', 'עומס', 'load'], ['V', '#dc2626', 'מהירות', 'speed'],
  ]
  return (
    <div dir="ltr" style={{ background: '#1f2937', borderRadius: 14, padding: '14px 8px 10px', margin: '10px 0', display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
      {parts.map(([txt, c, he, en], i) => (
        <div key={i} style={{ textAlign: 'center', minWidth: 34 }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, color: '#f8fafc', borderBottom: `3px solid ${c}`, paddingBottom: 2 }}>
            {txt}{i === 0 ? '/' : ''}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: c, marginTop: 4, filter: 'brightness(1.6)' }}>{lang === 'en' ? en : he}</div>
        </div>
      ))}
    </div>
  )
}

function DotSvg({ lang }: { lang: Lang }) {
  return (
    <div dir="ltr" style={{ background: '#1f2937', borderRadius: 14, padding: '14px 10px 10px', margin: '10px 0', textAlign: 'center' }}>
      <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 20, color: '#94a3b8', letterSpacing: 1 }}>
        DOT XXXX XXXX <span style={{ color: '#f8fafc', borderBottom: '3px solid #f59e0b' }}>23</span><span style={{ color: '#f8fafc', borderBottom: '3px solid #22c55e' }}>24</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6, fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: '#fbbf24' }}>23 = {t(lang, 'שבוע', 'week')}</span>
        <span style={{ color: '#4ade80' }}>24 = {t(lang, 'שנה (2024)', 'year (2024)')}</span>
      </div>
    </div>
  )
}

/** Tire cross-section: tread (green, repairable) vs shoulders + sidewalls (red). */
function PunctureSvg({ lang }: { lang: Lang }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 10, margin: '10px 0', textAlign: 'center' }}>
      <svg width="260" height="150" viewBox="0 0 260 150" aria-hidden>
        {/* sidewalls */}
        <path d="M40 30 Q22 75 40 130" stroke={BAD} strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d="M220 30 Q238 75 220 130" stroke={BAD} strokeWidth="16" fill="none" strokeLinecap="round" />
        {/* shoulders */}
        <path d="M40 30 Q48 16 74 14" stroke={BAD} strokeWidth="16" fill="none" />
        <path d="M220 30 Q212 16 186 14" stroke={BAD} strokeWidth="16" fill="none" />
        {/* tread */}
        <line x1="76" y1="14" x2="184" y2="14" stroke={OK} strokeWidth="16" />
        {[92, 112, 130, 148, 168].map(x => <line key={x} x1={x} y1="8" x2={x} y2="20" stroke="#f0fdf4" strokeWidth="3" />)}
        {/* rim */}
        <rect x="56" y="118" width="148" height="14" rx="4" fill="#cbd5e1" />
        <text x="130" y="48" textAnchor="middle" fontSize="13" fontWeight="800" fill={OK}>{t(lang, '✓ מותר לתקן', '✓ Repairable')}</text>
        <text x="130" y="66" textAnchor="middle" fontSize="11" fill="#475569">{t(lang, 'אזור הדריכה, עד ~6 מ"מ', 'tread area, up to ~6 mm')}</text>
        <text x="130" y="96" textAnchor="middle" fontSize="13" fontWeight="800" fill={BAD}>{t(lang, '✕ אסור: כתף ודופן', '✕ Not: shoulder & sidewall')}</text>
      </svg>
    </div>
  )
}

export default function GuideDiagram({ kind, lang }: { kind: DiagramKey; lang: Lang }) {
  switch (kind) {
    case 'toe': return <Row items={[
      { svg: <ToeSvg deg={10} color={INK} />, label: t(lang, 'פנימה (Toe-in)', 'Toe-in') },
      { svg: <ToeSvg deg={0} color={OK} />, label: t(lang, 'ישר ✓', 'Straight ✓') },
      { svg: <ToeSvg deg={-10} color={INK} />, label: t(lang, 'החוצה (Toe-out)', 'Toe-out') },
    ]} />
    case 'camber': return <Row items={[
      { svg: <CamberSvg deg={-12} color={INK} />, label: t(lang, 'שלילי', 'Negative') },
      { svg: <CamberSvg deg={0} color={OK} />, label: t(lang, 'אפס', 'Zero') },
      { svg: <CamberSvg deg={12} color={INK} />, label: t(lang, 'חיובי', 'Positive') },
    ]} />
    case 'caster': return <>
      <Row items={[
      { svg: <CasterSvg deg={14} color={INK} />, label: t(lang, 'חיובי (נטוי אחורה)', 'Positive (tilted back)') },
      { svg: <CasterSvg deg={-14} color={INK} />, label: t(lang, 'שלילי (נטוי קדימה)', 'Negative (tilted forward)') },
      ]} />
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: -4 }}>{t(lang, '← כיוון הנסיעה', '← direction of travel')}</div>
    </>
    case 'size': return <SizeSvg lang={lang} />
    case 'dot': return <DotSvg lang={lang} />
    case 'puncture': return <PunctureSvg lang={lang} />
  }
}
