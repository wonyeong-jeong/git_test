import { useEffect, useState } from 'react'
import type { FxRate } from '../types'

/** 환율은 개별 종목 시세처럼 자주 안 바뀌고, 공개 API를 불필요하게 자주 두드리지 않기 위해 5분 간격 */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export interface UseFxRatesResult {
  rates: FxRate[]
  /** 원화 환산에서 제일 많이 쓰는 값이라 바로 꺼내 쓸 수 있게 별도로 노출 */
  usdKrw: number | null
  lastUpdated: Date | null
  error: string | null
}

/** 원/달러 등 환율을 5분마다 갱신해서 들고 있는 훅. 보유종목 원화 환산 토글 등에서 재사용한다 */
export function useFxRates(): UseFxRatesResult {
  const [rates, setRates] = useState<FxRate[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchRates(): Promise<void> {
      try {
        const result = await window.api.marketData.getFxRates()
        if (cancelled) return
        setRates(result)
        setLastUpdated(new Date())
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    fetchRates()
    const id = setInterval(fetchRates, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const usdKrw = rates.find((r) => r.code === 'FX_USDKRW')?.rate ?? null

  return { rates, usdKrw, lastUpdated, error }
}
