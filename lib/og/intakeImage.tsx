import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { logoPalette } from '@/lib/og/logoColors'
import { rtl } from '@/lib/og/rtl'

const FONT_FILES = [
  ['assistant-hebrew-400-normal.woff', 400],
  ['assistant-hebrew-800-normal.woff', 800],
  ['assistant-latin-400-normal.woff',  400],
  ['assistant-latin-800-normal.woff',  800],
] as const

// Hebrew + Latin subsets of Assistant (OFL, from @fontsource/assistant) — same font as the intake page.
function loadFonts() {
  return Promise.all(FONT_FILES.map(async ([file, weight]) => ({
    name: 'Assistant', weight, style: 'normal' as const,
    data: await readFile(join(process.cwd(), 'lib/og/fonts', file)),
  })))
}

/**
 * Purchase-inspection link preview (1200x630) branded with the business logo and
 * colours. Returns null when the logo can't be decoded.
 */
export async function renderIntakeOgImage(name: string, logoBase64: string): Promise<ImageResponse | null> {
  let logoPng: Buffer
  try {
    logoPng = await sharp(Buffer.from(logoBase64, 'base64'))
      .flatten({ background: '#ffffff' })
      .trim({ threshold: 20 })
      .resize(760, 460, { fit: 'inside', withoutEnlargement: true })
      .png().toBuffer()
  } catch {
    return null
  }
  const [{ bg, accent }, fonts] = await Promise.all([logoPalette(logoPng), loadFonts()])
  const shown = name.length > 26 ? name.slice(0, 25) + '…' : name

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: bg, fontFamily: 'Assistant', color: '#fff', position: 'relative' }}>
        {/* Logo card + inspection badge */}
        <div style={{ position: 'absolute', left: 70, top: 115, width: 430, height: 380, background: '#fff', borderRadius: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${logoPng.toString('base64')}`} alt="" style={{ maxWidth: 380, maxHeight: 230, objectFit: 'contain', marginBottom: 70 }} />
          <div style={{ position: 'absolute', bottom: -40, right: -40, width: 160, height: 160, borderRadius: 34, background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 136, height: 136, borderRadius: 28, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width={100} height={100} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 14v-3l2-4h8l2.5 3H18a2 2 0 0 1 2 2" />
                <path d="M3 14h7" />
                <circle cx="6" cy="15" r="1.6" />
                <circle cx="16" cy="16" r="4" />
                <path d="m14.4 16 1.1 1.1 2.1-2.2" />
                <path d="m19 19 2.5 2.5" stroke={accent} />
              </svg>
            </div>
          </div>
        </div>

        {/* Text (right side) — each line rendered separately, see lib/og/rtl.ts */}
        <div style={{ position: 'absolute', right: 80, top: 190, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 80, fontWeight: 800 }}>{rtl('בדיקת קנייה')}</div>
          {shown && <div style={{ fontSize: 44, fontWeight: 800, color: accent, marginTop: 4 }}>{rtl(shown)}</div>}
          <div style={{ fontSize: 32, marginTop: 24 }}>{rtl('מלאו פרטים לפני ההגעה –')}</div>
          <div style={{ fontSize: 32, marginTop: 4 }}>{rtl('ונחסוך לכם זמן במקום')}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
