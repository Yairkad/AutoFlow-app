'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { waLink } from '@/lib/landing/wa'
import { Icon } from './icons'

export interface CarForSale {
  id: string
  make: string | null
  model: string | null
  year: number | null
  km: number | null
  fuel_type: string | null
  color: string | null
  ask_price: number | null
  photos: string[]
  status: string
  seats: number | null
  condition: string | null
  notes: string | null
}

function driveThumb(idOrUrl: string) {
  const m1 = idOrUrl.match(/\/d\/([a-zA-Z0-9_-]{10,})/)
  const m2 = idOrUrl.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  const id = m1 ? m1[1] : m2 ? m2[1] : idOrUrl.trim()
  if (!id) return ''
  return `https://lh3.googleusercontent.com/d/${id}`
}

function fmt(n: number | null | undefined) {
  if (!n) return '—'
  return n.toLocaleString('he-IL')
}

const CONDITION_MAP: Record<string, string> = {
  'new': 'חדש', 'like-new': 'כמו חדש', 'good': 'טוב', 'fair': 'סביר', 'poor': 'לשיפוץ',
}

// ── Photo carousel (shared by card + modal) ───────────────────────────────────

function PhotoCarousel({ photos, title, height = '100%', onPhotoClick }: {
  photos: string[]
  title: string
  height?: string
  onPhotoClick?: (idx: number) => void
}) {
  const [idx, setIdx] = useState(0)

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length) }
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i + 1) % photos.length) }

  if (photos.length === 0) {
    return (
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#283970', background: '#ECE6D8' }}><Icon name="car" size={64} stroke={1.4} /></div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, background: '#000', overflow: 'hidden' }}>
      <img
        src={driveThumb(photos[idx])}
        alt={`${title} – תמונה ${idx + 1}`}
        onClick={() => onPhotoClick?.(idx)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          cursor: onPhotoClick ? 'zoom-in' : 'default',
        }}
      />
      {photos.length > 1 && (
        <>
          <button onClick={prev} aria-label="תמונה קודמת" style={arrowBtn('right')}>‹</button>
          <button onClick={next} aria-label="תמונה הבאה" style={arrowBtn('left')}>›</button>
          <div style={{
            position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: '5px',
          }}>
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                aria-label={`תמונה ${i + 1}`}
                style={{
                  width: '8px', height: '8px', borderRadius: '50%', border: 'none', padding: 0,
                  background: i === idx ? '#F5C800' : 'rgba(255,255,255,.55)',
                  cursor: 'pointer', transition: 'background .2s',
                }}
              />
            ))}
          </div>
          <div style={{
            position: 'absolute', top: '8px', left: '8px',
            background: 'rgba(0,0,0,.5)', color: '#fff',
            borderRadius: '12px', padding: '2px 9px', fontSize: '11px', fontWeight: 700,
          }}>
            {idx + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  )
}

// ── Car detail modal ───────────────────────────────────────────────────────────

function CarModal({ car, phone, onClose }: { car: CarForSale; phone: string; onClose: () => void }) {
  const photos = car.photos.filter(Boolean)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const title = [car.make, car.model, car.year].filter(Boolean).join(' ')

  const closeLightbox = useCallback(() => setLightboxIdx(null), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (lightboxIdx !== null) closeLightbox(); else onClose() }
      if (lightboxIdx !== null) {
        if (e.key === 'ArrowRight') setLightboxIdx(i => i !== null ? (i - 1 + photos.length) % photos.length : 0)
        if (e.key === 'ArrowLeft')  setLightboxIdx(i => i !== null ? (i + 1) % photos.length : 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, photos.length, onClose, closeLightbox])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const waHref = waLink(phone, `שלום, אני מעוניין ברכב ${title}`)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: '5vh 0', zIndex: 1001,
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        padding: '0 16px', overflowY: 'auto',
      }}>
        <div style={{
          background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '820px',
          overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.35)',
          margin: 'auto',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
            background: '#283970',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#fff' }}>{title || 'רכב למכירה'}</h2>
              {car.status === 'reserved' && (
                <span style={{ background: '#d97706', color: '#fff', borderRadius: '6px', padding: '2px 10px', fontSize: '11px', fontWeight: 700, marginTop: '4px', display: 'inline-block' }}>שמור</span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="סגור"
              style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: '50%', width: '36px', height: '36px', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </div>

          {/* Main carousel */}
          <div style={{ aspectRatio: '16/9', background: '#000' }}>
            <PhotoCarousel
              photos={photos}
              title={title}
              height="100%"
              onPhotoClick={idx => setLightboxIdx(idx)}
            />
          </div>

          {/* Thumbnails strip */}
          {photos.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', padding: '10px 16px', overflowX: 'auto', background: '#f8fafc' }}>
              {photos.map((p, i) => (
                <img
                  key={i}
                  src={driveThumb(p)}
                  alt={`תמונה ${i + 1}`}
                  onClick={() => setLightboxIdx(i)}
                  style={{
                    width: '72px', height: '54px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0,
                    cursor: 'zoom-in', border: '2px solid transparent', transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#F5C800')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                />
              ))}
            </div>
          )}

          {/* Details */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {car.km != null      && <DetailRow label="ק״מ"        value={`${fmt(car.km)} ק"מ`} />}
              {car.fuel_type       && <DetailRow label="דלק"        value={car.fuel_type} />}
              {car.color           && <DetailRow label="צבע"        value={car.color} />}
              {car.seats != null   && <DetailRow label="מושבים"     value={String(car.seats)} />}
              {car.condition       && <DetailRow label="מצב"        value={CONDITION_MAP[car.condition] ?? car.condition} />}
              {car.year != null    && <DetailRow label="שנת ייצור"  value={String(car.year)} />}
            </div>

            {car.notes && (
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', borderRight: '4px solid #F5C800' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>הערות</div>
                <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{car.notes}</p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>מחיר מבוקש</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#1a2a6c' }}>
                  {car.ask_price ? `₪${fmt(car.ask_price)}` : 'לפי הסכמה'}
                </div>
              </div>
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: '#0E7A3E', color: '#fff', borderRadius: '999px',
                    padding: '12px 24px', fontWeight: 700, fontSize: '15px',
                    textDecoration: 'none',
                  }}
                >
                  <Icon name="wa" size={18} />שאלו אותנו על הרכב בוואטסאפ
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          onClick={closeLightbox}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.93)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img
            src={driveThumb(photos[lightboxIdx])}
            alt={`${title} – תמונה ${lightboxIdx + 1}`}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
          />
          {photos.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i - 1 + photos.length) % photos.length : 0) }} style={{ ...arrowBtn('right'), width: '44px', height: '44px', fontSize: '26px' }}>‹</button>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i !== null ? (i + 1) % photos.length : 0) }} style={{ ...arrowBtn('left'), width: '44px', height: '44px', fontSize: '26px' }}>›</button>
            </>
          )}
          <button onClick={closeLightbox} style={{ position: 'absolute', top: '16px', left: '16px', background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,.7)', fontSize: '13px', fontWeight: 700 }}>{lightboxIdx + 1} / {photos.length}</div>
        </div>
      )}
    </>
  )
}

// ── Detail row helper ─────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 14px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

// ── Car card ──────────────────────────────────────────────────────────────────

function arrowBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: '6px',
    background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
    borderRadius: '50%', width: '32px', height: '32px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', cursor: 'pointer', lineHeight: 1,
    backdropFilter: 'blur(4px)',
  }
}

// ── Car tile (same square-tile look as the services gallery) ─────────────────

function CarTile({ car, onOpen }: { car: CarForSale; onOpen: () => void }) {
  const photos = car.photos.filter(Boolean)
  const title = [car.make, car.model].filter(Boolean).join(' ') || 'רכב למכירה'
  const specs = [car.year && String(car.year), car.km != null && `${fmt(car.km)} ק"מ`, car.fuel_type].filter(Boolean) as string[]

  return (
    <article
      className="al-car"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`${title} – לפרטים`}
    >
      <span className={`al-badge${car.status === 'reserved' ? ' is-reserved' : ''}`}>{car.status === 'reserved' ? 'שמור' : 'זמין'}</span>
      {photos.length > 1 && <span className="al-photo-count">{photos.length} תמונות</span>}
      <div className="al-img">
        {photos[0] ? <img src={driveThumb(photos[0])} alt="" loading="lazy" /> : <Icon name="car" size={64} stroke={1.4} />}
      </div>
      <div className="al-shade" />
      <div className="al-tile-body">
        <h3>{title}</h3>
        {specs.length > 0 && <div className="al-specs">{specs.map(s => <span key={s}>{s}</span>)}</div>}
        <div className="al-price-row">
          <span className="al-price">{car.ask_price ? `₪${fmt(car.ask_price)}` : 'לפי הסכמה'}</span>
          <span className="al-more">פרטים ←</span>
        </div>
      </div>
    </article>
  )
}

// ── Catalog with filters (/for-sale) ──────────────────────────────────────────

const PRICE_STEPS = [50_000, 80_000, 120_000, 180_000, 250_000]

export default function CarsForSale({ cars, phone }: { cars: CarForSale[]; phone: string }) {
  const [selected, setSelected] = useState<CarForSale | null>(null)
  const [make, setMake] = useState('')
  const [fuel, setFuel] = useState('')
  const [maxPrice, setMaxPrice] = useState(0)
  const [sort, setSort] = useState<'new' | 'price'>('new')

  const makes = useMemo(() => [...new Set(cars.map(c => c.make).filter(Boolean) as string[])].sort(), [cars])
  const fuels = useMemo(() => [...new Set(cars.map(c => c.fuel_type).filter(Boolean) as string[])].sort(), [cars])

  const shown = useMemo(() => {
    const list = cars.filter(c =>
      (!make || c.make === make) &&
      (!fuel || c.fuel_type === fuel) &&
      (!maxPrice || (c.ask_price ?? 0) <= maxPrice))
    return sort === 'price' ? [...list].sort((a, b) => (a.ask_price ?? Infinity) - (b.ask_price ?? Infinity)) : list
  }, [cars, make, fuel, maxPrice, sort])

  return (
    <>
      <div className="al-wrap">
        <form className="al-filters" aria-label="סינון רכבים" onSubmit={e => e.preventDefault()}>
          <label htmlFor="f-make">יצרן
            <select id="f-make" value={make} onChange={e => setMake(e.target.value)}>
              <option value="">הכל</option>
              {makes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label htmlFor="f-price">מחיר עד
            <select id="f-price" value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}>
              <option value={0}>ללא הגבלה</option>
              {PRICE_STEPS.map(p => <option key={p} value={p}>₪{p.toLocaleString('he-IL')}</option>)}
            </select>
          </label>
          <label htmlFor="f-fuel">דלק
            <select id="f-fuel" value={fuel} onChange={e => setFuel(e.target.value)}>
              <option value="">הכל</option>
              {fuels.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label htmlFor="f-sort">מיון
            <select id="f-sort" value={sort} onChange={e => setSort(e.target.value as 'new' | 'price')}>
              <option value="new">החדשים ביותר</option>
              <option value="price">מחיר: מהנמוך</option>
            </select>
          </label>
        </form>

        {cars.length === 0 ? (
          <p className="al-empty">כרגע אין רכבים למכירה. מחפשים רכב מסוים? דברו איתנו ונעדכן כשמגיע רכב מתאים.</p>
        ) : (
          <>
            <p className="al-count">{shown.length === cars.length ? `${cars.length} רכבים זמינים` : `${shown.length} מתוך ${cars.length} רכבים`}</p>
            {shown.length === 0
              ? <p className="al-empty">אין רכבים שמתאימים לסינון. נסו לשנות את הבחירה.</p>
              : <div className="al-cars">{shown.map(car => <CarTile key={car.id} car={car} onOpen={() => setSelected(car)} />)}</div>}
          </>
        )}
      </div>

      {selected && <CarModal car={selected} phone={phone} onClose={() => setSelected(null)} />}
    </>
  )
}
