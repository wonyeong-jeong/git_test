import { useEffect, useRef, useState } from 'react'
import type { Quote } from '../types'
import { getMarketSession, isMarketActive } from '../domain/marketHours'

/** 자격증명 오류 등으로 계속 실패할 때 API를 무한히 두드리지 않도록 자동 갱신을 멈추는 기준 */
const MAX_CONSECUTIVE_FAILURES = 3

interface WatchedSymbol {
  ticker: string
  currency: 'KRW' | 'USD'
}

interface UseAutoRefreshQuotesResult {
  quotes: Record<string, Quote>
  status: 'idle' | 'loading' | 'error'
  error: string | null
  lastUpdated: Date | null
  autoRefresh: boolean
  setAutoRefresh: (value: boolean) => void
  intervalSeconds: number
  setIntervalSeconds: (value: number) => void
  /** 자동 갱신은 켜져 있는데 대상 종목들의 시장이 전부 닫혀 있어서 대기 중인 상태 */
  marketsClosedNow: boolean
  refreshNow: () => Promise<void>
}

/**
 * 관심종목/보유종목 페이지가 공통으로 쓰는 "시세 자동 갱신" 로직을 한 곳으로 모은 훅.
 *
 * - 자동 갱신은 대상 종목들의 시장(국내 KRX/미국 증시)이 정규장이든 시간외든 하나라도
 *   열려 있을 때만 실제로 API를 호출한다 (장마감 시간에 의미 없는 폴링을 막기 위함).
 * - refreshNow()로 직접 호출하는 수동 새로고침은 이 제약과 무관하게 항상 즉시 조회한다.
 * - 연속 3회 실패하면(자격증명 미등록 등) 자동 갱신을 스스로 끈다.
 *
 * 페이지마다 거의 같은 폴링 로직을 반복해서 만들지 않으려고 훅으로 분리했다 — 나중에
 * "시세 자동 갱신" 기능 자체를 걷어내야 한다면 이 파일 하나와, 페이지에서 이 훅을 호출하는
 * 부분만 지우면 된다.
 */
export function useAutoRefreshQuotes(watched: WatchedSymbol[]): UseAutoRefreshQuotesResult {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(30)
  const [marketsClosedNow, setMarketsClosedNow] = useState(false)

  const inFlightRef = useRef(false)
  const failureCountRef = useRef(0)
  const autoRefreshRef = useRef(autoRefresh)
  const watchedRef = useRef(watched)
  watchedRef.current = watched

  useEffect(() => {
    autoRefreshRef.current = autoRefresh
  }, [autoRefresh])

  /** 다시 켤 때는 실패 카운트를 초기화해서, 이전에 3회 실패로 자동 꺼졌던 경우에도 새로 3번의 기회를 준다 */
  function enableAutoRefresh(value: boolean): void {
    if (value) failureCountRef.current = 0
    setAutoRefresh(value)
  }

  async function refreshNow(): Promise<void> {
    const targets = watchedRef.current
    if (targets.length === 0 || inFlightRef.current) return
    inFlightRef.current = true
    setStatus('loading')
    setError(null)
    try {
      const results = await window.api.broker.getQuotes(targets.map((t) => t.ticker))
      const map: Record<string, Quote> = {}
      for (const q of results) map[q.symbol] = q
      setQuotes(map)
      setStatus('idle')
      setLastUpdated(new Date())
      failureCountRef.current = 0
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failureCountRef.current += 1
      setStatus('error')
      if (autoRefreshRef.current && failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setAutoRefresh(false)
        setError(`${message} (자동 갱신 ${MAX_CONSECUTIVE_FAILURES}회 연속 실패로 중지됨)`)
      } else {
        setError(message)
      }
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!autoRefresh || watched.length === 0) {
      setMarketsClosedNow(false)
      return undefined
    }

    function tick(): void {
      const anyOpen = watchedRef.current.some((t) => isMarketActive(getMarketSession(t.currency)))
      setMarketsClosedNow(!anyOpen)
      if (anyOpen) refreshNow()
    }

    tick()
    const id = setInterval(tick, intervalSeconds * 1000)
    return () => clearInterval(id)
    // watched는 매 렌더마다 새 배열일 수 있어 개수만 의존성으로 둔다. tick()은 항상
    // watchedRef.current(최신 값)를 읽으므로 정확성에는 문제가 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, intervalSeconds, watched.length])

  return {
    quotes,
    status,
    error,
    lastUpdated,
    autoRefresh,
    setAutoRefresh: enableAutoRefresh,
    intervalSeconds,
    setIntervalSeconds,
    marketsClosedNow,
    refreshNow
  }
}
