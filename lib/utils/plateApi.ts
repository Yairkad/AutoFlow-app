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

// Map API response fields → our fields
function mapResponse(record: Record<string, unknown>): VehicleData {
  return {
    make:      record['tozeret_nm']       as string  || undefined,
    model:     record['kinuy_mishari']    as string  || undefined,
    year:      record['shnat_yitzur']     ? Number(record['shnat_yitzur'])  : undefined,
    color:     record['tzeva_rechev']     as string  || undefined,
    fuel:      record['sug_delek_nm']     as string  || undefined,
    engine:    record['nefach_manoa']     ? Number(record['nefach_manoa']) : undefined,
    chassis:   record['misgeret']         as string  || undefined,
    seats:     record['mispar_moshavim']  ? Number(record['mispar_moshavim']) : undefined,
    test_date: record['mivchan_acharon_dt'] as string || undefined,
    ownership: record['baalut']           as string  || undefined,
  }
}

export async function fetchVehicleByPlate(plate: string): Promise<VehicleData | null> {
  const clean = plate.replace(/[-\s]/g, '')
  if (!clean || clean.length < 5) return null

  try {
    const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3&filters={"mispar_rechev":"${clean}"}&limit=1`
    const res = await fetch(url)
    const json = await res.json()
    const records = json?.result?.records
    if (!records?.length) return null
    return mapResponse(records[0])
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
