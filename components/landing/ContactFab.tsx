'use client'

import { useEffect, useState } from 'react'
import { Icon } from './icons'

// Floating round button (bottom-left) that opens a choice: call or WhatsApp.
export default function ContactFab({ phone, waHref }: { phone: string; waHref: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!phone && !waHref) return null

  return (
    <aside className="al-fab" aria-label="יצירת קשר מהיר">
      {open && (
        <div className="al-fab-menu" id="al-fab-menu" onClick={() => setOpen(false)}>
          {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className="al-fab-wa"><Icon name="wa" />וואטסאפ</a>}
          {phone && <a href={`tel:${phone}`} className="al-fab-call"><Icon name="phone" />חיוג</a>}
        </div>
      )}
      <button type="button" className="al-fab-btn" aria-label="יצירת קשר" aria-expanded={open} aria-controls="al-fab-menu" onClick={() => setOpen(o => !o)}>
        {open ? <Icon name="x" size={24} stroke={2.4} /> : <Icon name="chat" size={28} />}
      </button>
    </aside>
  )
}
