'use client'

import { useState, useEffect, useCallback } from 'react'

interface CarForSale {
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
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', background: '#f1f5f9' }}>🚗</div>
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

function CarModal({ car, waHref, onClose }: { car: CarForSale; waHref: string; onClose: () => void }) {
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

  const waMsg = waHref
    ? waHref.replace('ברצוני לקבל מידע', encodeURIComponent(`שלום, אני מעוניין ברכב ${title}`))
    : ''

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
            background: '#1a2a6c',
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
              {car.km != null      && <DetailRow icon="🛣️" label="ק״מ"        value={`${fmt(car.km)} ק"מ`} />}
              {car.fuel_type       && <DetailRow icon="⛽"  label="דלק"        value={car.fuel_type} />}
              {car.color           && <DetailRow icon="🎨" label="צבע"        value={car.color} />}
              {car.seats != null   && <DetailRow icon="💺" label="מושבים"     value={String(car.seats)} />}
              {car.condition       && <DetailRow icon="⭐" label="מצב"        value={CONDITION_MAP[car.condition] ?? car.condition} />}
              {car.year != null    && <DetailRow icon="📅" label="שנת ייצור"  value={String(car.year)} />}
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
                  href={waMsg || waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: '#25d366', color: '#fff', borderRadius: '12px',
                    padding: '12px 24px', fontWeight: 700, fontSize: '15px',
                    textDecoration: 'none', boxShadow: '0 4px 12px rgba(37,211,102,.35)',
                  }}
                >
                  💬 צור קשר על הרכב הזה
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

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 14px' }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{icon} {label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

// ── Car card ──────────────────────────────────────────────────────────────────

function CarCard({ car, onOpen }: { car: CarForSale; onOpen: () => void }) {
  const photos = car.photos.filter(Boolean)
  const title = [car.make, car.model, car.year].filter(Boolean).join(' ')

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', borderRadius: '16px', overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,.08)', border: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', cursor: 'pointer',
        transition: 'transform .2s, box-shadow .2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,.13)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,.08)' }}
    >
      {/* Photo */}
      <div style={{ position: 'relative', aspectRatio: '4/3', background: '#f1f5f9', overflow: 'hidden' }}>
        <PhotoCarousel photos={photos} title={title} height="100%" />
        {car.status === 'reserved' && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#d97706', color: '#fff', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 700, pointerEvents: 'none' }}>
            שמור
          </div>
        )}
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(26,42,108,.8)', color: '#F5C800', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, pointerEvents: 'none' }}>
          לחץ לפרטים ↗
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1a2a6c' }}>{title || 'רכב למכירה'}</h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {car.km != null  && <Chip icon="🛣️">{fmt(car.km)} ק"מ</Chip>}
          {car.fuel_type   && <Chip icon="⛽">{car.fuel_type}</Chip>}
          {car.color       && <Chip icon="🎨">{car.color}</Chip>}
          {car.seats != null && <Chip icon="💺">{car.seats} מושבים</Chip>}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>מחיר מבוקש</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#1a2a6c' }}>
            {car.ask_price ? `₪${fmt(car.ask_price)}` : 'לפי הסכמה'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: '#f8fafc', border: '1px solid #e2e8f0',
      borderRadius: '20px', padding: '3px 10px', fontSize: '12px', color: '#475569',
    }}>
      {icon} {children}
    </span>
  )
}

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

// ── Main section ──────────────────────────────────────────────────────────────

export default function CarsForSale({ cars, waHref }: { cars: CarForSale[]; waHref: string }) {
  const [selected, setSelected] = useState<CarForSale | null>(null)

  if (cars.length === 0) return null

  return (
    <>
      <section id="cars-for-sale" style={{ background: '#fff', padding: '80px 40px' }} aria-labelledby="cars-title">
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 id="cars-title" style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: '#1a2a6c', margin: '0 0 8px' }}>
              רכבים למכירה
            </h2>
            <p style={{ color: '#64748b', fontSize: '16px', margin: 0 }}>רכבים איכותיים במחירים הוגנים</p>
            <div style={{ width: '48px', height: '4px', background: '#F5C800', borderRadius: '2px', margin: '16px auto 0' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
            {cars.map(car => (
              <CarCard key={car.id} car={car} onOpen={() => setSelected(car)} />
            ))}
          </div>
        </div>
      </section>

      {selected && (
        <CarModal car={selected} waHref={waHref} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
