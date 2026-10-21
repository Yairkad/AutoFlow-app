// Yard terminal session: the employee picked a name + typed a PIN.
// Not a Supabase session — a signed cookie that only the /yard pages and
// /api/yard routes accept. Web Crypto only, so proxy.ts can verify it too.

export const YARD_COOKIE = 'yard_emp'
/**
 * The employee stays signed in until they press "יציאה" — no idle logout (owner's request:
 * workers kept having to sign in again). The cookie lives 30 days and is renewed on every
 * use (/api/yard-auth/renew), so a terminal in daily use never expires.
 */
export const YARD_SESSION_MAX_AGE = 30 * 24 * 60 * 60 // seconds

export interface YardSessionPayload {
  e: string   // employee id
  t: string   // tenant id
  exp: number // unix seconds
}

function secret(): string {
  const s = process.env.YARD_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('YARD_SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY missing')
  return s
}

const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach(b => { s += String.fromCharCode(b) })
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function signYardSession(employeeId: string, tenantId: string): Promise<string> {
  const payload: YardSessionPayload = { e: employeeId, t: tenantId, exp: Math.floor(Date.now() / 1000) + YARD_SESSION_MAX_AGE }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  return `${body}.${b64url(await hmac(body))}`
}

/** Valid, unexpired payload — or null. Checks the signature only, no DB. */
export async function verifyYardSession(token: string | undefined): Promise<YardSessionPayload | null> {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const expected = await hmac(body)
    const got = fromB64url(sig)
    if (got.length !== expected.length) return null
    let diff = 0
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i]
    if (diff !== 0) return null
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as YardSessionPayload
    if (!p.e || !p.t || !p.exp || p.exp < Date.now() / 1000) return null
    return p
  } catch {
    return null
  }
}
