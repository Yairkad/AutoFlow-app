'use client'

import { useState, useCallback, useRef } from 'react'
import { fetchVehicleByPlate, filterFields, VehicleData, MODULE_FIELDS } from '@/lib/utils/plateApi'

type Module = keyof typeof MODULE_FIELDS

interface UsePlateSearchResult {
  loading: boolean
  error: string | null
  data: Partial<VehicleData> | null
  search: (plate: string) => Promise<Partial<VehicleData> | null>
}

export function usePlateSearch(module: Module): UsePlateSearchResult {
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [data, setData]     = useState<Partial<VehicleData> | null>(null)
  const lastPlate = useRef<string>('')

  const search = useCallback(async (plate: string) => {
    const clean = plate.replace(/[-\s]/g, '')
    if (clean === lastPlate.current) return data
    if (clean.length < 5) return null

    lastPlate.current = clean
    setLoading(true)
    setError(null)

    const result = await fetchVehicleByPlate(clean)
    setLoading(false)

    if (!result) {
      setError('לא נמצא רכב')
      setData(null)
      return null
    }

    const filtered = filterFields(result, module)
    setData(filtered)
    return filtered
  }, [module, data])

  return { loading, error, data, search }
}
