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
            style={{ padding: '11px 8px', fontSize: '15px', ...(active ? { background: o.color ?? '#1d4ed8', borderColor: o.color ?? '#1d4ed8' } : {}) }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Chips<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-full font-bold border transition-colors ${o.value === value ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}
          style={{ padding: '6px 14px', fontSize: '14px' }}>
          {o.label}
        </button>
      ))}
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

/** Page frame: dark top bar on the yard terminal, plain block on the office page. */
export function HubFrame({ variant, title, action, children }: {
  variant: 'yard' | 'office'
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  if (variant === 'office') {
    return (
      <div className="flex flex-col gap-3">
        {action && <div className="flex justify-end">{action}</div>}
        {children}
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full" style={{ background: '#f0f4f8' }}>
      <div className="bg-slate-800 text-white flex items-center justify-between flex-shrink-0 gap-3" style={{ padding: '12px 18px' }}>
        <h1 className="text-xl font-bold">{title}</h1>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ padding: '14px', minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-slate-400 gap-2" style={{ padding: '48px 0' }}>
      <span className="text-5xl">{icon}</span>
      <p className="text-lg font-medium">{text}</p>
    </div>
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
