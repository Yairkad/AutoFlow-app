import { NextRequest, NextResponse } from 'next/server'

const RESOURCE_LOCAL    = '053cea08-09bc-40ec-8f7a-156f0677aff3'
const RESOURCE_IMPORTED = '03adc637-b6fe-402b-9937-7c3d3afc9140'
// כלי רכב מעל 3.5 טון וכלי רכב חסרי קוד דגם — trucks/buses/tractors/work vehicles (e.g. a
// 19-seat Sprinter shuttle) never show up in the two passenger-vehicle datasets above.
const RESOURCE_HEAVY    = 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790'

async function query(resourceId: string, plate: string) {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&filters=%7B%22mispar_rechev%22%3A%22${plate}%22%7D&limit=1`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return null
  const json = await res.json()
  const r = json?.result?.records?.[0]
  if (!r) return null
  const tireSize = (r['zmig_kidmi'] || r['zmig_kid'] || null) as string | null
  return {
    // The heavy-vehicle registry has no kinuy_mishari (commercial model name) — falls back to
    // degem_nm (its own model field) instead.
    make:     (r['tozeret_nm']    as string) || null,
    model:    ((r['kinuy_mishari'] ?? r['degem_nm']) as string) || null,
    year:     r['shnat_yitzur']   ? Number(r['shnat_yitzur']) : null,
    tireSize: tireSize ? tireSize.trim() : null,
  }
}

export async function GET(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get('plate')?.replace(/[-\s]/g, '')
  if (!plate || plate.length < 5) return NextResponse.json(null)
  try {
    const [local, imported, heavy] = await Promise.all([
      query(RESOURCE_LOCAL, plate),
      query(RESOURCE_IMPORTED, plate),
      query(RESOURCE_HEAVY, plate),
    ])
    return NextResponse.json(local ?? imported ?? heavy ?? null)
  } catch {
    return NextResponse.json(null)
  }
}
