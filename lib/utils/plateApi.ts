// Israel data.gov.il vehicle API

export interface VehicleData {
  plate?: string       // לוחית רישוי (מהחיפוש)
  make?: string        // יצרן
  model?: string       // דגם
  year?: number        // שנת ייצור
  color?: string       // צבע
  fuel?: string        // סוג דלק
  engine?: number      // נפח מנוע (סמ"ק)
  chassis?: string     // מספר שילדה
  seats?: number       // מספר מושבים
  test_date?: string   // תאריך טסט אחרון
  ownership?: string   // בעלות (פרטי/ליסינג/...)
}

// Which fields each module needs
export type PlateField = keyof VehicleData

export const MODULE_FIELDS: Record<string, PlateField[]> = {
  inspection: ['make', 'model', 'year', 'color', 'fuel', 'engine', 'chassis', 'seats'],
  cars:       ['make', 'model', 'year', 'color', 'fuel', 'ownership', 'plate'],
  alignment:  ['make', 'model', 'year'],
  quotes:     ['make', 'model', 'year'],
  debts:      ['make', 'model', 'year'],
  tracking:   ['make', 'model', 'year', 'color'],
}

// Map API response fields → our fields. The heavy-vehicle registry (buses/trucks/tractors,
// resource RESOURCE_HEAVY below) uses degem_nm instead of kinuy_mishari for the model name and
// has no tzeva_rechev/baalut/mivchan_acharon_dt fields at all — those simply stay undefined.
function mapResponse(record: Record<string, unknown>): VehicleData {
  return {
    make:      record['tozeret_nm']       as string  || undefined,
    model:     (record['kinuy_mishari'] ?? record['degem_nm']) as string || undefined,
    year:      record['shnat_yitzur']     ? Number(record['shnat_yitzur'])  : undefined,
    color:     record['tzeva_rechev']     as string  || undefined,
    fuel:      record['sug_delek_nm']     as string  || undefined,
    engine:    record['nefach_manoa']     ? Number(record['nefach_manoa']) : undefined,
    chassis:   record['misgeret']         as string  || undefined,
    seats:     (record['mispar_moshavim'] ?? record['mispar_mekomot']) ? Number(record['mispar_moshavim'] ?? record['mispar_mekomot']) : undefined,
    test_date: record['mivchan_acharon_dt'] as string || undefined,
    ownership: record['baalut']           as string  || undefined,
  }
}

// data.gov.il resource IDs
const RESOURCE_LOCAL    = '053cea08-09bc-40ec-8f7a-156f0677aff3' // רישיון רכב — רכבים מקומיים
const RESOURCE_IMPORTED = '03adc637-b6fe-402b-9937-7c3d3afc9140' // רכבים מיובאים
// כלי רכב מעל 3.5 טון וכלי רכב חסרי קוד דגם — trucks/buses/tractors/work vehicles (e.g. a 19-seat
// Sprinter shuttle) never show up in the two passenger-vehicle datasets above.
const RESOURCE_HEAVY    = 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790'

async function queryResource(resourceId: string, plate: string): Promise<VehicleData | null> {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&filters={"mispar_rechev":"${plate}"}&limit=1`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const json = await res.json()
  const records = json?.result?.records
  if (!records?.length) return null
  return mapResponse(records[0])
}

export async function fetchVehicleByPlate(plate: string): Promise<VehicleData | null> {
  const clean = plate.replace(/[-\s]/g, '')
  if (!clean || clean.length < 5) return null

  try {
    // Query all three registries in parallel; local passenger vehicles take precedence,
    // then imported, then the heavy/bus/truck registry as a last resort.
    const [local, imported, heavy] = await Promise.all([
      queryResource(RESOURCE_LOCAL, clean),
      queryResource(RESOURCE_IMPORTED, clean),
      queryResource(RESOURCE_HEAVY, clean),
    ])
    return local ?? imported ?? heavy ?? null
  } catch {
    return null
  }
}

// Filter only relevant fields for a module
export function filterFields(data: VehicleData, module: keyof typeof MODULE_FIELDS): Partial<VehicleData> {
  const fields = MODULE_FIELDS[module] ?? []
  return Object.fromEntries(
    fields.map(f => [f, data[f]]).filter(([, v]) => v !== undefined)
  )
}
