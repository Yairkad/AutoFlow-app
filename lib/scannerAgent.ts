// Talks to "סורק AutoFlow" — the small Windows agent (tools/scanner-agent) that scans from the
// office scanner and returns a PDF. Client-side only. The agent asks the user once to approve
// this site; Chrome may also ask once to allow access to local network devices.

const AGENT_URL = 'http://127.0.0.1:47321'

export const SCANNER_DOWNLOAD_URL = '/downloads/autoflow-scanner.exe'

export class ScannerAgentMissingError extends Error {
  constructor() { super('סורק AutoFlow לא נמצא במחשב הזה — התקינו אותו מהקישור "התקנת סורק למחשב"') }
}

/** Scans (feeder if it has paper, otherwise the glass) and returns all pages as one PDF. */
export async function scanWithAgent(fileName = 'scan.pdf'): Promise<File> {
  let res: Response
  try {
    res = await fetch(`${AGENT_URL}/scan?source=auto`, { method: 'POST', signal: AbortSignal.timeout(5 * 60_000) })
  } catch {
    throw new ScannerAgentMissingError()
  }
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error ?? 'שגיאת סריקה')
  }
  return new File([await res.blob()], fileName, { type: 'application/pdf' })
}
