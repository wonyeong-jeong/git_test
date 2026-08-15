import { useEffect, useState } from 'react'
import type { IndexQuote } from '../types'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export interface UseMarketIndicesResult {
  indices: IndexQuote[]
  lastUpdated: Date | null
  error: string | null
}

/** 코스피/코스닥/다우/나스닥 등 주요 지수를 5분마다 갱신해서 들고 있는 훅. 상단 티커바 전용 */
export function useMarketIndices(): UseMarketIndicesResult {
  const [indices, setIndices] = useState<IndexQuote[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchIndices(): Promise<void> {
      try {
        const result = await window.api.marketData.getIndices()
        if (cancelled) return
        setIndices(result)
        setLastUpdated(new Date())
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchIndices()
    const id = setInterval(fetchIndices, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return { indices, lastUpdated, error }
}
