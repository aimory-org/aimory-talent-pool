/**
 * React hook for fetching lookup data (skills, certifications, cities).
 */
import { useState, useEffect } from 'react'
import { getLookups, type LookupsResponse } from '@/lib/api'

export interface UseLookupsResult {
  skills: string[]
  certifications: string[]
  cities: { city: string; state: string }[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

/**
 * Hook for fetching dropdown lookup data.
 * Caches results for the session.
 */
export function useLookups(): UseLookupsResult {
  const [data, setData] = useState<LookupsResponse>({
    skills: [],
    certifications: [],
    cities: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  const fetchLookups = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await getLookups()
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch lookups'))
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    fetchLookups()
  }, [])
  
  return {
    ...data,
    isLoading,
    error,
    refresh: fetchLookups,
  }
}
