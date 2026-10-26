// WhatsApp click-to-chat link from an Israeli phone number (client-safe).
export function waLink(phone: string, text: string) {
  const p = phone.replace(/\D/g, '').replace(/^0/, '972')
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : ''
}
