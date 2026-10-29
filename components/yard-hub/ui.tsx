'use client'

// Small building blocks shared by the worker-hub panels (yard terminal + office page).

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}
        style={{ width: 520, maxWidth: '96vw', maxHeight: '92dvh' }}>
        <div className="flex items-center justify-between border-b border-slate-200" style={{ padding: '14px 18px' }}>
          <p className="font-black text-slate-800" style={{ fontSize: '19px' }}>{title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" style={{ fontSize: '22px' }} aria-label="סגור">✕</button>
        </div>
        <div className="overflow-y-auto flex flex-col gap-3" style={{ padding: '16px 18px' }}>{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full border-2 border-slate-200 focus:border-blue-500 rounded-xl bg-white outline-none text-base'
export const inputStyle: React.CSSProperties = { padding: '10px 12px' }

export function Toggle<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string; color?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map(o => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl font-bold border-2 transition-colors ${active ? 'text-white' : 'bg-white text-slate-600 border-slate-200'}`}
            style={{ padding: '11px 8px', fontSize: '15px', ...(active ? { background: o.color ?? '#1E2B66', borderColor: o.color ?? '#1E2B66' } : {}) }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Filter inside a section (e.g. waiting / to check / closed): a segmented control, visually
 *  different from the page's main tabs. `count` shows as a small badge. */
export function Chips<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex sm:inline-flex bg-slate-100 rounded-xl sm:self-start w-full sm:w-auto" style={{ padding: 4, gap: 2 }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`flex-1 sm:flex-none justify-center rounded-lg font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            style={{ padding: '7px 10px', fontSize: '14px', minWidth: 0 }}>
            {o.label}
            {o.count !== undefined && (
              <span className={`rounded-full font-black ${o.count > 0 ? (active ? 'bg-slate-800 text-white' : 'bg-slate-300 text-slate-700') : 'bg-slate-200 text-slate-400'}`}
                style={{ fontSize: '11px', minWidth: 20, padding: '1px 6px', textAlign: 'center' }}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))}
        className="bg-slate-100 rounded-lg font-black text-slate-600 active:bg-slate-200" style={{ width: 44, height: 44, fontSize: '22px' }}>−</button>
      <input type="number" min={1} value={value} onChange={e => onChange(Math.max(1, Number(e.target.value) || 1))}
        className={inputCls} style={{ ...inputStyle, width: 70, textAlign: 'center', fontWeight: 800 }} />
      <button type="button" onClick={() => onChange(value + 1)}
        className="bg-slate-100 rounded-lg font-black text-green-600 active:bg-slate-200" style={{ width: 44, height: 44, fontSize: '22px' }}>+</button>
    </div>
  )
}

/** Section frame. Yard: dark top bar. Office: a card with the title, a one-line explanation and the
 *  main action on the same header row. */
export function HubFrame({ variant, title, subtitle, action, children }: {
  variant: 'yard' | 'office'
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  if (variant === 'office') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col">
        <div className="flex items-start justify-between gap-3 flex-wrap border-b border-slate-100" style={{ padding: '14px 18px' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="font-black text-slate-900" style={{ fontSize: '18px' }}>{title}</h2>
            {subtitle && <p className="text-slate-500" style={{ fontSize: '13px', marginTop: 2 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
        <div className="flex flex-col gap-3" style={{ padding: '14px 18px 18px' }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0 gap-3" style={{ padding: '12px 18px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-slate-300" style={{ fontSize: '13px' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ padding: '14px', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, text, hint, action }: { icon: string; text: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-1.5 border-2 border-dashed border-slate-200 rounded-2xl" style={{ padding: '28px 16px' }}>
      <span style={{ fontSize: 34 }}>{icon}</span>
      <p className="font-bold text-slate-600" style={{ fontSize: 16 }}>{text}</p>
      {hint && <p className="text-slate-400" style={{ fontSize: 13 }}>{hint}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

/** Small secondary action on a card (call, edit, delete…) */
export function IconBtn({ onClick, href, title, tone = 'plain', children }: {
  onClick?: () => void; href?: string; title: string; tone?: 'plain' | 'green' | 'danger'; children: React.ReactNode
}) {
  const cls = `rounded-lg font-bold flex items-center justify-center ${tone === 'green' ? 'bg-green-600 text-white' : tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`
  const style: React.CSSProperties = { width: 42, height: 38, fontSize: 16, ...(tone === 'green' ? { color: '#fff' } : {}) }
  return href
    ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={title} aria-label={title} className={cls} style={style}>{children}</a>
    : <button type="button" onClick={onClick} title={title} aria-label={title} className={cls} style={style}>{children}</button>
}

export const cardGrid: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }

/** Main action button of a section ("+ לקוח חדש") */
export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold whitespace-nowrap" style={{ padding: '9px 16px', fontSize: '15px' }}>
      {children}
    </button>
  )
}

export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
  return res.json()
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
