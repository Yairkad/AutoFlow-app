import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

/** Yard login PIN: 4–8 digits. */
export const PIN_RE = /^\d{4,8}$/
export const MAX_PIN_ATTEMPTS = 5
export const PIN_LOCK_MS = 60_000

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(pin, salt, 32)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function checkPin(pin: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const got = await scryptAsync(pin, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(got, expected)
}
