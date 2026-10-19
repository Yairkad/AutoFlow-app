import { NextResponse } from 'next/server'
import { YARD_COOKIE } from '@/lib/auth/yard-session'

// POST /api/yard-auth/logout — back to the terminal's name picker
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(YARD_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
