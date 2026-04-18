'use client'

import { useState } from 'react'

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
}

function driveThumb(idOrUrl: string) {
  const m = idOrUrl.match(/\/d\/([a-zA-Z0-9_-]{10,})/)
  const id = m ? m[1] : idOrUrl.trim()
  if (!id) return ''
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`
}

function fmt(n: number | null | undefined) {
  if (!n) return '—'
  return n.toLocaleString('he-IL')
}

function CarCard({ car, waHref }: { car: CarForSale; waHref: string }) {
  const photos = car.photos.filter(Boolean)
  const [idx, setIdx] = useState(0)

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIdx(i => (i - 1 + photos.length) % photos.length)
  }
  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIdx(i => (i + 1) % photos.length)
  }

  const title = [car.make, car.model, car.year].filter(Boolean).join(' ')

  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 2px 16px rgba(0,0,0,.08)',
      border: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Photo area */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#f1f5f9' }}>
        {photos.length > 0 ? (
          <>
            <img
              src={driveThumb(photos[idx])}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
                        background: i === idx ? '#F5C800' : 'rgba(255,255,255,.6)',
                        cursor: 'pointer', transition: 'background .2s',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>🚗</div>
        )}

        {car.status === 'reserved' && (
          <div style={{
            position: 'absolute', top: '10px', right: '10px',
            background: '#d97706', color: '#fff',
            borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: 700,
          }}>
            שמור
          </div>
        )}
      </div>

      {/* Details */}
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1a2a6c' }}>{title || 'רכב למכירה'}</h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {car.km != null && (
            <Chip icon="🛣️">{fmt(car.km)} ק"מ</Chip>
          )}
          {car.fuel_type && <Chip icon="⛽">{car.fuel_type}</Chip>}
          {car.color && <Chip icon="🎨">{car.color}</Chip>}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>מחיר מבוקש</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#1a2a6c' }}>
              {car.ask_price ? `₪${fmt(car.ask_price)}` : 'לפי הסכמה'}
            </div>
          </div>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#25d366', color: '#fff',
                borderRadius: '10px', padding: '9px 16px',
                fontWeight: 700, fontSize: '13px', textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(37,211,102,.3)', whiteSpace: 'nowrap',
              }}
            >
              💬 צור קשר
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

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

export default function CarsForSale({ cars, waHref }: { cars: CarForSale[]; waHref: string }) {
  if (cars.length === 0) return null

  return (
    <section id="cars-for-sale" style={{ background: '#fff', padding: '80px 40px' }} aria-labelledby="cars-title">
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 id="cars-title" style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, color: '#1a2a6c', margin: '0 0 8px' }}>
            רכבים למכירה
          </h2>
          <p style={{ color: '#64748b', fontSize: '16px', margin: 0 }}>רכבים איכותיים במחירים הוגנים</p>
          <div style={{ width: '48px', height: '4px', background: '#F5C800', borderRadius: '2px', margin: '16px auto 0' }} />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '24px',
        }}>
          {cars.map(car => (
            <CarCard key={car.id} car={car} waHref={waHref} />
          ))}
        </div>
      </div>
    </section>
  )
}
