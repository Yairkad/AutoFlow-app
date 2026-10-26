// Line icons for the public site (no emoji there). Stroke icons follow currentColor.

const STROKE: Record<string, React.ReactNode> = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  wa: <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />,
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  nav: <path d="M3 11l18-8-8 18-2-8z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  tire: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M3.5 10.5h17M12 14v7" /></>,
  car: <><path d="M5 16h14M3 16v-3l2-5h14l2 5v3" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
}

export type IconName = keyof typeof STROKE

export function Icon({ name, size = 20, stroke = 2, className, style }: {
  name: IconName; size?: number; stroke?: number; className?: string; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      {STROKE[name]}
    </svg>
  )
}

export function Star({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" />
    </svg>
  )
}

export function Sparkle({ size = 20, color, style }: { size?: number; color: string; style?: React.CSSProperties }) {
  return (
    <svg className="al-sparkle" width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={style}>
      <path d="M12 0c.6 6 3 9.4 12 12-9 2.6-11.4 6-12 12-.6-6-3-9.4-12-12 9-2.6 11.4-6 12-12z" />
    </svg>
  )
}

// Brand marks for the navigation buttons (simplified Waze / Google Maps logos).
export function WazeLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#33CCFF" />
      <path d="M50 14C32 14 18 27.6 18 44.4c0 10.4 5 19.5 12.8 25.4l-1.3 3.2 2.8 5.1 6.5-3.2c3.2.9 6.7 1.4 11.2 1.4s8-.5 11.2-1.4l6.5 3.2 2.8-5.1-1.3-3.2C77 63.9 82 54.8 82 44.4 82 27.6 68 14 50 14z" fill="#fff" />
      <circle cx="39" cy="42" r="5.5" fill="#33CCFF" /><circle cx="61" cy="42" r="5.5" fill="#33CCFF" />
      <path d="M37 55 Q50 64 63 55" stroke="#33CCFF" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="37" cy="82" r="5.5" fill="#4d4d4d" /><circle cx="63" cy="82" r="5.5" fill="#4d4d4d" />
    </svg>
  )
}

export function MapsPin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4C15.2 4 8 11.2 8 20c0 12 16 28 16 28s16-16 16-28C40 11.2 32.8 4 24 4z" fill="#EA4335" />
      <path d="M24 4C15.2 4 8 11.2 8 20c0 3.8 1.2 7.3 3.2 10.2L28 6.2C26.7 4.8 25.4 4 24 4z" fill="#C5221F" />
      <circle cx="24" cy="20" r="7" fill="#fff" />
      <circle cx="24" cy="20" r="3.5" fill="#4285F4" />
    </svg>
  )
}

export function QuoteMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" fill="currentColor" aria-hidden="true" style={{ color: '#283970', flexShrink: 0 }}>
      <path d="M0 26V15C0 6.7 4.3 1.5 12 0l1.5 3.2C8.8 4.6 6.6 7.6 6.4 12H12v14zm17 0V15c0-8.3 4.3-13.5 12-15l1 3.2c-4.7 1.4-6.9 4.4-7.1 8.8H29v14z" />
    </svg>
  )
}
