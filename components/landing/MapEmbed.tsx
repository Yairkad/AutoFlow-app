'use client'

import { useState } from 'react'
import { Icon } from './icons'

// Google Maps loads only after the visitor asks for it, so no Google cookies are set on page load.
export default function MapEmbed({ src, address }: { src: string; address: string }) {
  const [show, setShow] = useState(false)

  if (show) {
    return <iframe className="al-map" src={src} title={`מפה: ${address}`} referrerPolicy="no-referrer-when-downgrade" />
  }
  return (
    <div className="al-map al-map-gate">
      <Icon name="pin" size={40} stroke={1.6} />
      <strong>{address}</strong>
      <button type="button" className="al-btn al-btn-navy" onClick={() => setShow(true)}>הצגת מפה</button>
      <small>המפה נטענת מ-Google Maps ועשויה להציב עוגיות של Google</small>
    </div>
  )
}
