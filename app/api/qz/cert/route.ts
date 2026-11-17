import { NextResponse } from 'next/server'
import { sessionTenant } from '@/lib/auth/sessionTenant'
import { getQzKey } from '@/lib/print/qzKeys'

// GET → the business's QZ Tray certificate (PEM). ?download=1 → as override.crt for the QZ Tray folder.
export async function GET(req: Request) {
  const guard = await sessionTenant()
  if ('error' in guard) return guard.error
  try {
    const { certificate } = await getQzKey(guard.tenantId)
    const download = new URL(req.url).searchParams.get('download') === '1'
    return new NextResponse(certificate, {
      headers: {
        'Content-Type': download ? 'application/x-x509-ca-cert' : 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(download ? { 'Content-Disposition': 'attachment; filename="override.crt"' } : {}),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
