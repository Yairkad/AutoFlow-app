// Loading placeholders shaped like the content that is coming (instead of "טוען..." / a spinner).
// Grey pulsing blocks in currentColor — fit both the light office pages and the dark yard terminal.
import type { CSSProperties } from 'react'

type Len = number | string

export function Skel({ w = '100%', h = 14, r = 6, style }: { w?: Len; h?: Len; r?: Len; style?: CSSProperties }) {
  return <span className="skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

/** Wrapper that tells screen readers something is loading */
function Busy({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div role="status" aria-label="טוען" style={style}>{children}</div>
}

/** A few lines of text */
export function SkeletonLines({ n = 3, style }: { n?: number; style?: CSSProperties }) {
  const widths = ['92%', '78%', '85%', '60%', '88%', '70%']
  return (
    <Busy style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '6px 0', ...style }}>
      {Array.from({ length: n }, (_, i) => <Skel key={i} w={widths[i % widths.length]} h={12} />)}
    </Busy>
  )
}

/** Stacked list rows / cards (lists, panels, drawers) */
export function SkeletonList({ rows = 4, h = 64, style }: { rows?: number; h?: number; style?: CSSProperties }) {
  return (
    <Busy style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, minHeight: h, borderRadius: 10, border: '1px solid rgba(127,127,127,.18)' }}>
          <Skel w={36} h={36} r={10} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skel w={`${55 - (i % 3) * 10}%`} h={13} />
            <Skel w={`${35 + (i % 2) * 15}%`} h={10} />
          </div>
          <Skel w={56} h={22} r={11} />
        </div>
      ))}
    </Busy>
  )
}

/** A table: header row + body rows */
export function SkeletonTable({ rows = 8, cols = 5, style }: { rows?: number; cols?: number; style?: CSSProperties }) {
  const row = (key: number, head = false) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '12px 14px',
      borderBottom: '1px solid rgba(127,127,127,.15)' }}>
      {Array.from({ length: cols }, (_, c) => <Skel key={c} h={head ? 10 : 12} w={head ? '50%' : `${60 + ((key + c) % 4) * 10}%`} />)}
    </div>
  )
  return (
    <Busy style={{ borderRadius: 12, border: '1px solid rgba(127,127,127,.18)', overflow: 'hidden', ...style }}>
      {row(-1, true)}
      {Array.from({ length: rows }, (_, i) => row(i))}
    </Busy>
  )
}

/** A grid of cards (stat tiles, item cards) */
export function SkeletonCards({ n = 6, h = 110, min = 220, style }: { n?: number; h?: number; min?: number; style?: CSSProperties }) {
  return (
    <Busy style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12, ...style }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ height: h, padding: 14, borderRadius: 12, border: '1px solid rgba(127,127,127,.18)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skel w="45%" h={12} />
          <Skel w="70%" h={20} />
          <Skel w="35%" h={10} style={{ marginTop: 'auto' }} />
        </div>
      ))}
    </Busy>
  )
}

/** A form: label + field pairs */
export function SkeletonForm({ fields = 6, style }: { fields?: number; style?: CSSProperties }) {
  return (
    <Busy style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, ...style }}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Skel w="35%" h={10} />
          <Skel h={38} r={8} />
        </div>
      ))}
    </Busy>
  )
}

/** A whole page: title bar, toolbar, then a table / cards / form */
export function PageSkeleton({ kind = 'table', style }: { kind?: 'table' | 'cards' | 'form'; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skel w={42} h={42} r={12} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skel w={180} h={18} />
          <Skel w={240} h={11} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Skel w={260} h={38} r={8} />
        <Skel w={90} h={38} r={8} />
        <Skel w={110} h={38} r={8} style={{ marginInlineStart: 'auto' }} />
      </div>
      {kind === 'table' && <SkeletonTable />}
      {kind === 'cards' && <SkeletonCards />}
      {kind === 'form' && <SkeletonForm />}
    </div>
  )
}
