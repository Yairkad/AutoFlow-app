'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from './icons'

export interface GalleryService { id: string; name: string; description: string | null; image_url: string | null }
export interface GalleryPrice { id: string; category: string; service_name: string; price: number | null; price_note: string | null }

type Kind = 'tires' | 'alignment' | 'inspection' | 'sale' | 'other'

// Services and price-list categories are free text in Settings, so they are tied together by name.
function kindOf(text: string): Kind {
  if (/בדיק/.test(text)) return 'inspection'
  if (/רכב/.test(text) && /מכיר|סוכנות|יד\s?2|למכירה/.test(text)) return 'sale'
  if (/צמיג|פנצ|תקר|גלגל/.test(text)) return 'tires'
  if (/פרונט|כיוון/.test(text)) return 'alignment'
  return 'other'
}

const KIND_ICON: Record<Kind, IconName> = { tires: 'tire', alignment: 'wheel', inspection: 'search', sale: 'car', other: 'wrench' }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

function categoryFor(service: string, categories: string[]): string | null {
  const s = norm(service)
  const exact = categories.find(c => norm(c) === s)
  if (exact) return exact
  const partial = categories.find(c => s.includes(norm(c)) || norm(c).includes(s))
  if (partial) return partial
  const k = kindOf(s)
  if (k === 'other' || k === 'sale') return null
  return categories.find(c => kindOf(c) === k) ?? null
}

export default function ServiceGallery({ services, prices, intakeHref, carsHref }: {
  services: GalleryService[]
  prices: GalleryPrice[]
  intakeHref: string | null
  carsHref: string | null
}) {
  const [active, setActive] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ title: string; items: GalleryPrice[]; license: boolean } | null>(null)
  const dlgRef = useRef<HTMLDialogElement>(null)
  const categories = [...new Set(prices.map(p => p.category))]

  function openPrices(service: GalleryService, category: string) {
    setDialog({ title: service.name, items: prices.filter(p => p.category === category), license: kindOf(service.name) === 'inspection' })
    requestAnimationFrame(() => dlgRef.current?.showModal())
  }

  const cols = services.length % 3 === 0 && services.length % 4 !== 0 ? ' n3' : services.length === 2 ? ' n2' : ''

  return (
    <>
      <div className={`al-gallery${cols}`}>
        {services.map(s => {
          const kind = kindOf(s.name)
          const category = categoryFor(s.name, categories)
          return (
            <article
              key={s.id}
              className={`al-tile${active === s.id ? ' is-on' : ''}`}
              tabIndex={0}
              onClick={e => { if (!(e.target as HTMLElement).closest('a,button')) setActive(a => a === s.id ? null : s.id) }}
            >
              <div className="al-img">
                {s.image_url
                  ? <img src={s.image_url} alt="" loading="lazy" />
                  : <Icon name={KIND_ICON[kind]} size={64} stroke={1.4} />}
              </div>
              <div className="al-shade" />
              <div className="al-tile-body">
                <h3>{s.name}</h3>
                {s.description && <p>{s.description}</p>}
                <div className="al-tile-actions">
                  {kind === 'inspection' && intakeHref && <Link href={intakeHref}>למילוי טופס הזמנה ←</Link>}
                  {kind === 'sale' && carsHref && <Link href={carsHref}>לרכבים למכירה ←</Link>}
                  {category && <button type="button" onClick={() => openPrices(s, category)}>מחירון שירות ←</button>}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <dialog
        ref={dlgRef}
        className="al-dialog"
        aria-labelledby="al-dlg-title"
        onClick={e => { if (e.target === dlgRef.current) dlgRef.current?.close() }}
        onClose={() => setDialog(null)}
      >
        {dialog && (
          <>
            <div className="al-dlg-head">
              <h2 id="al-dlg-title">מחירון שירות · {dialog.title}</h2>
              <button type="button" className="al-dlg-close" aria-label="סגירה" onClick={() => dlgRef.current?.close()}><Icon name="x" size={18} stroke={2.4} /></button>
            </div>
            <div className="al-dlg-body">
              {dialog.license && (
                <p style={{ margin: '12px 0 4px', color: 'var(--al-muted)', fontSize: '15px' }}>
                  מחיר הבדיקה נקבע לפי <b style={{ color: 'var(--al-navy-deep)' }}>קבוצת הרישוי</b> של הרכב.
                </p>
              )}
              {dialog.items.map(i => (
                <div key={i.id} className="al-row">
                  <span>{i.service_name}{i.price_note && <small>{i.price_note}</small>}</span>
                  <strong>{i.price != null ? `₪${i.price.toLocaleString('he-IL')}` : 'לפי בדיקה'}</strong>
                </div>
              ))}
              {dialog.license && <LicenseHint />}
              <p className="al-disclaimer"><Icon name="info" size={18} /><span>המחירים לידיעה בלבד וכוללים מע״מ. המחיר בפועל ייקבע במקום, לאחר בדיקת הרכב.</span></p>
            </div>
          </>
        )}
      </dialog>
    </>
  )
}

// Schematic vehicle licence with the "license group" field highlighted.
function LicenseHint() {
  const fields = ['בעלות', 'תוצר', 'דגם', 'שנת ייצור', 'סוג דלק', 'מספר שלדה', 'צבע', null, 'תוקף']
  return (
    <>
      <h3 className="al-dlg-sub">איפה מוצאים את קבוצת הרישוי?</h3>
      <figure className="al-license" aria-label="הדמיה של רישיון רכב עם סימון השדה קבוצת רישוי">
        <div className="al-license-top"><b>רישיון רכב</b><span className="al-plate">12-345-67</span></div>
        <div className="al-lic-grid">
          {fields.map((f, i) => f
            ? <div key={i}>{f}<i /></div>
            : <div key={i} className="is-hit">קבוצת רישוי<strong>4</strong></div>)}
        </div>
        <figcaption className="al-lic-callout">השדה המסומן בצהוב: המספר שמופיע בו הוא קבוצת הרישוי</figcaption>
      </figure>
    </>
  )
}
