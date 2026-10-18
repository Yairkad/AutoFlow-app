// Talks to "סורק AutoFlow" — the small Windows agent (tools/scanner-agent) that scans from the
// office scanner and returns a PDF. Client-side only. The agent asks the user once to approve
// this site; Chrome may also ask once to allow access to local network devices.

const AGENT_URL = 'http://127.0.0.1:47321'
const DEVICE_KEY = 'autoflow-scanner-device'

export const SCANNER_DOWNLOAD_URL = '/downloads/autoflow-scanner.exe'

export interface ScannerDevice { id: string; name: string }

export class ScannerAgentMissingError extends Error {
  constructor() { super('סורק AutoFlow לא נמצא במחשב הזה — התקינו אותו מהקישור "התקנת סורק למחשב"') }
}
export class ScannerAgentOutdatedError extends Error {
  constructor() { super('יש גרסה חדשה של סורק AutoFlow — הורידו והתקינו אותה מהקישור "התקנת סורק למחשב"') }
}
export class ScannerDeviceNotFoundError extends Error {}

async function call(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  let res: Response
  try {
    res = await fetch(AGENT_URL + path, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new ScannerAgentMissingError()
  }
  if (res.status === 404) throw new ScannerAgentOutdatedError()
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    if (j?.code === 'DEVICE_NOT_FOUND') throw new ScannerDeviceNotFoundError(j.error)
    throw new Error(j?.error ?? 'שגיאת סריקה')
  }
  return res
}

/** Scanners Windows knows about on this computer. */
export async function listScanners(): Promise<ScannerDevice[]> {
  return (await (await call('/devices')).json()).devices ?? []
}

/** The scanner chosen on this computer (kept in this browser). */
export function getSavedScanner(): string | null {
  try { return localStorage.getItem(DEVICE_KEY) } catch { return null }
}
export function saveScanner(id: string | null) {
  try { if (id) localStorage.setItem(DEVICE_KEY, id); else localStorage.removeItem(DEVICE_KEY) } catch { /* private mode */ }
}

/** Scans (feeder if it has paper, otherwise the glass) and returns all pages as one PDF. */
export async function scanWithAgent(deviceId: string, fileName = 'scan.pdf'): Promise<File> {
  const res = await call(`/scan?source=auto&device=${encodeURIComponent(deviceId)}`, { method: 'POST' }, 5 * 60_000)
  return new File([await res.blob()], fileName, { type: 'application/pdf' })
}
