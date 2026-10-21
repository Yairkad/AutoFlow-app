import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { signYardSession, verifyYardSession, YARD_COOKIE, YARD_SESSION_MAX_AGE } from '@/lib/auth/yard-session'

// POST /api/yard-auth/renew — sliding session: re-issue a still-valid terminal cookie for
// another YARD_SESSION_MAX_AGE, so an employee who uses the terminal is never signed out.
export async function POST() {
  const jar = await cookies()
  const s = await verifyYardSession(jar.get(YARD_COOKIE)?.value)
  if (!s) return NextResponse.json({ ok: false }, { status: 401 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(YARD_COOKIE, await signYardSession(s.e, s.t), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: YARD_SESSION_MAX_AGE,
  })
  return res
}
