// Satori (next/og) lays every line out left-to-right, so Hebrew comes out mirrored.
// Convert a single-line logical string to visual order: runs of LTR text (digits,
// Latin) keep their order, everything else is reversed, and run order is flipped.
// Only safe for text that never wraps — render each line separately.
const LTR_RUN = /[A-Za-z0-9][A-Za-z0-9.,:/@+%-]*[A-Za-z0-9%]|[A-Za-z0-9]/g
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }

export function rtl(text: string): string {
  const parts: { s: string; ltr: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(LTR_RUN)) {
    if (m.index! > last) parts.push({ s: text.slice(last, m.index), ltr: false })
    parts.push({ s: m[0], ltr: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ s: text.slice(last), ltr: false })
  return parts
    .reverse()
    .map(p => p.ltr ? p.s : [...p.s].reverse().map(ch => MIRROR[ch] ?? ch).join(''))
    .join('')
}
