import { getIntakeTenant } from '@/lib/og/intakeTenant'
import { renderIntakeOgImage } from '@/lib/og/intakeImage'

export const runtime = 'nodejs'

// WhatsApp/Facebook link-preview image for the purchase-inspection intake link,
// branded with the business's own logo and colours. Businesses without a logo
// get the static /og/inspection-intake.png (see app/intake/[token]/page.tsx).

function staticFallback(req: Request) {
  return Response.redirect(new URL('/og/inspection-intake.png', req.url), 302)
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('t') ?? ''
  const tenant = await getIntakeTenant(token).catch(() => null)
  const m = tenant?.logo?.match(/^data:image\/[\w.+-]+;base64,(.+)$/)
  if (!tenant || !m) return staticFallback(req)
  const img = await renderIntakeOgImage(tenant.name, m[1])
  return img ?? staticFallback(req)
}
