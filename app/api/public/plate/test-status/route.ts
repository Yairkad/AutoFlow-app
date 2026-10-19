import { NextRequest, NextResponse } from 'next/server'

// Annual-test status for many plates at once, from the Ministry of Transport registry
// (data.gov.il): tokef_dt = license valid until, mivchan_acharon_dt = last track test.
// The registry has no separate "fee paid" field.
const RESOURCES = [
  '053cea08-09bc-40ec-8f7a-156f0677aff3', // רכבים מקומיים
  '03adc637-b6fe-402b-9937-7c3d3afc9140', // רכבים מיובאים
]
const CHUNK = 100

export interface GovTestStatus { tokef: string | null; lastTest: string | null }

const day = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)

async function queryChunk(resourceId: string, plates: string[]) {
  const filters = encodeURIComponent(JSON.stringify({ mispar_rechev: plates }))
  const fields  = 'mispar_rechev,tokef_dt,mivchan_acharon_dt'
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&filters=${filters}&fields=${fields}&limit=${plates.length * 2}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const json = await res.json()
  return (json?.result?.records ?? []) as Record<string, unknown>[]
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const plates = [...new Set(((body?.plates ?? []) as unknown[])
    .map(p => String(p ?? '').replace(/[-\s]/g, ''))
    .filter(p => /^\d{5,8}$/.test(p)))].slice(0, 2000)
  if (!plates.length) return NextResponse.json({})

  const chunks: string[][] = []
  for (let i = 0; i < plates.length; i += CHUNK) chunks.push(plates.slice(i, i + CHUNK))

  const out: Record<string, GovTestStatus> = {}
  try {
    // Local registry first; imported only fills plates the local one didn't have.
    for (const resourceId of RESOURCES) {
      const pending = chunks.map(c => c.filter(p => !out[p])).filter(c => c.length)
      const results = await Promise.all(pending.map(c => queryChunk(resourceId, c)))
      for (const r of results.flat()) {
        const plate = String(r['mispar_rechev'] ?? '')
        if (plate && !out[plate]) out[plate] = { tokef: day(r['tokef_dt']), lastTest: day(r['mivchan_acharon_dt']) }
      }
    }
  } catch { /* partial result is fine — the client only applies what came back */ }
  return NextResponse.json(out)
}
