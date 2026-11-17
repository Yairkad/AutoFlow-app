import { NextResponse } from 'next/server'
import { createSign } from 'crypto'
import { sessionTenant } from '@/lib/auth/sessionTenant'
import { getQzKey } from '@/lib/print/qzKeys'

// POST { request } → base64 SHA512-RSA signature of the QZ Tray message, with the business's key.
export async function POST(req: Request) {
  const guard = await sessionTenant()
  if ('error' in guard) return guard.error
  const { request } = await req.json().catch(() => ({ request: null }))
  if (typeof request !== 'string' || request.length > 10_000) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  try {
    const { private_key } = await getQzKey(guard.tenantId)
    const signature = createSign('SHA512').update(request).sign(private_key, 'base64')
    return new NextResponse(signature, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
