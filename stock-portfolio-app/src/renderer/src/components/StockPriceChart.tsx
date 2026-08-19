import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HistoricalPricePoint } from '../types'
import { formatAxisTick, formatMoney } from '../utils/format'

interface Props {
  ticker: string
  currency: 'KRW' | 'USD'
  /** 생략하면 최근 1년 */
  fromDate?: string
  height?: number
}

function oneYearAgoIso(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * 종목 하나의 실제 과거 종가 추이를 보여주는 재사용 컴포넌트. naverClient.getHistoricalPrices를
 * 그대로 쓴다 — 국내는 상장일까지, 해외는 최대 약 9년(그 이상은 데이터가 없어 조용히 그만큼만
 * 표시됨)까지 나온다. 단일 시리즈라 범례는 따로 두지 않는다(제목이 이미 뭘 그렸는지 말해준다).
 */
export default function StockPriceChart({ ticker, currency, fromDate, height = 220 }: Props): JSX.Element {
  const [prices, setPrices] = useState<HistoricalPricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    const from = fromDate ?? oneYearAgoIso()
    const to = new Date().toISOString().slice(0, 10)
    window.api.marketData
      .getHistoricalPrices(ticker, currency, from, to)
      .then((pts) => {
        if (cancelled) return
        setPrices(pts)
        if (pts.length === 0) setFailed(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ticker, currency, fromDate])

  if (loading) return <p className="muted small">주가 차트 불러오는 중…</p>
  if (failed || prices.length === 0) return <p className="muted small">이 종목의 과거 시세를 가져오지 못했어요.</p>

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={prices}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => formatAxisTick(v, currency)} width={60} />
          <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
          <Line type="monotone" dataKey="close" name="종가" stroke="var(--primary)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
