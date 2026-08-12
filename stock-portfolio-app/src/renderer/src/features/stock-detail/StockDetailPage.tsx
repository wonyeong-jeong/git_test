import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DividendRecord, Holding, ManualPurchase } from '../../types'
import { BROKER_LABELS } from '../../types'
import StockAvatar from '../../components/StockAvatar'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { buildCumulativeTimeline, type CumulativeDelta } from '../../domain/assetGrowth'
import { groupDividendsByPeriod, sumDividendRecords, type DividendGranularity } from '../../domain/dividend'
import { calculateDividendTax } from '../../domain/tax'

interface Props {
  profileId: string
  holding: Holding
  onBack: () => void
}

const GRANULARITY_LABELS: Record<DividendGranularity, string> = { WEEK: '주간', MONTH: '월간', YEAR: '연간' }
const MAX_BUCKETS_SHOWN = 12

export default function StockDetailPage({ profileId, holding, onBack }: Props): JSX.Element {
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [dividends, setDividends] = useState<DividendRecord[]>([])
  const [granularity, setGranularity] = useState<DividendGranularity>('MONTH')

  useEffect(() => {
    window.api.manualPurchases
      .list(profileId)
      .then((all) => setPurchases(all.filter((p) => p.holdingId === holding.id)))
    window.api.dividends.list(profileId).then((all) => setDividends(all.filter((d) => d.holdingId === holding.id)))
  }, [profileId, holding.id])

  // 이 종목 하나만 실시간 시세를 추적한다 — 보유종목/관심종목 페이지와 같은 훅을 재사용하므로
  // 장 시간 인식·연속 실패 시 자동 중지 동작이 그대로 적용된다.
  const watchedSelf = useMemo(
    () => [{ ticker: holding.ticker, currency: holding.currency }],
    [holding.ticker, holding.currency]
  )
  const {
    quotes,
    status: priceStatus,
    error: priceError,
    lastUpdated,
    autoRefresh,
    setAutoRefresh,
    intervalSeconds,
    setIntervalSeconds,
    marketsClosedNow,
    refreshNow
  } = useAutoRefreshQuotes(watchedSelf)

  const quote = quotes[holding.ticker]
  const flash = useFlashOnChange(quote?.lastPrice)
  const priceKnown = quote && quote.currency === holding.currency

  const purchaseAmount = holding.quantity * holding.avgPrice
  const currentValue = priceKnown ? holding.quantity * quote.lastPrice : null
  const pl = currentValue != null ? currentValue - purchaseAmount : null

  // 실제 주가 차트는 없다(과거 시세 API 미연동) — 대신 매수/매도 기록으로부터 계산되는
  // 투입원금·보유수량의 실제 누적 추이를 보여준다. assetGrowth.ts의 buildCumulativeTimeline은
  // 원금/수량 어느 쪽에든 쓸 수 있도록 일반화되어 있다.
  const costTimeline = useMemo(() => {
    const deltas: CumulativeDelta[] = [
      { date: holding.createdAt.slice(0, 10), amount: holding.quantity * holding.avgPrice },
      ...purchases.map((p) => ({ date: p.date, amount: (p.side === 'SELL' ? -1 : 1) * p.quantity * p.price }))
    ]
    return buildCumulativeTimeline(deltas)
  }, [holding, purchases])

  const quantityTimeline = useMemo(() => {
    const deltas: CumulativeDelta[] = [
      { date: holding.createdAt.slice(0, 10), amount: holding.quantity },
      ...purchases.map((p) => ({ date: p.date, amount: (p.side === 'SELL' ? -1 : 1) * p.quantity }))
    ]
    return buildCumulativeTimeline(deltas)
  }, [holding, purchases])

  const dividendTotal = sumDividendRecords(dividends)
  const dividendBuckets = useMemo(
    () => groupDividendsByPeriod(dividends, granularity).slice(-MAX_BUCKETS_SHOWN),
    [dividends, granularity]
  )

  return (
    <div>
      <button type="button" className="link-plain" onClick={onBack} style={{ marginBottom: 12, display: 'block' }}>
        ← 보유 종목 목록으로
      </button>

      <div className="page-header">
        <h1>
          <span className="stock-name-cell">
            <StockAvatar ticker={holding.ticker} name={holding.name} />
            {holding.name}{' '}
            <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>
              ({holding.ticker})
            </span>
          </span>
        </h1>
        <button className="primary" onClick={refreshNow} disabled={priceStatus === 'loading'}>
          {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
        </button>
      </div>

      <AutoRefreshControls
        enabled={autoRefresh}
        onToggle={setAutoRefresh}
        intervalSeconds={intervalSeconds}
        onIntervalChange={setIntervalSeconds}
        lastUpdated={lastUpdated}
        marketsClosedNow={marketsClosedNow}
      />

      {priceError && <p className="status-error">현재가 조회 실패: {priceError}</p>}

      <div className="card">
        <div className="summary-cards">
          <div className="summary-card">
            <span className="label">증권사</span>
            <span className="value">{BROKER_LABELS[holding.broker]}</span>
          </div>
          <div className="summary-card">
            <span className="label">보유수량</span>
            <span className="value">{holding.quantity.toLocaleString()}주</span>
          </div>
          <div className="summary-card">
            <span className="label">평단가</span>
            <span className="value">
              {holding.avgPrice.toLocaleString()} {holding.currency}
            </span>
          </div>
          <div className="summary-card">
            <span className="label">매입금액</span>
            <span className="value">
              {Math.round(purchaseAmount).toLocaleString()} {holding.currency}
            </span>
          </div>
          <div className={`summary-card ${flash ? `flash-${flash}` : ''}`}>
            <span className="label">현재가</span>
            <span className="value">{quote ? `${quote.lastPrice.toLocaleString()} ${quote.currency}` : '—'}</span>
          </div>
          <div className="summary-card highlight">
            <span className="label">평가손익</span>
            <span className={`value ${pl === null ? '' : pl >= 0 ? 'num-positive' : 'num-negative'}`}>
              {pl === null ? '—' : `${pl >= 0 ? '+' : ''}${Math.round(pl).toLocaleString()} ${holding.currency}`}
            </span>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          등록일 {holding.createdAt.slice(0, 10)}
        </p>
      </div>

      <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
        아래 그래프는 실제 주가 차트가 아닙니다 — 이 앱은 과거 시세(캔들) API를 쓰지 않아서, 대신 매수/매도 기록으로부터
        계산되는 <strong>투입원금</strong>과 <strong>보유수량</strong>의 실제 누적 추이를 보여줍니다.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>누적 투입원금 추이</h2>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={costTimeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
              <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} ${holding.currency}`} />
              <Line type="stepAfter" dataKey="cumulativeValue" name="누적 투입원금" stroke="#3182F6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>보유수량 추이</h2>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={quantityTimeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => `${v.toLocaleString()}주`} />
              <Line type="stepAfter" dataKey="cumulativeValue" name="보유수량" stroke="#ADB5BD" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>과거 배당 내역</h2>
        {dividends.length === 0 ? (
          <p className="empty-hint">이 종목으로 받은 배당 기록이 없어요.</p>
        ) : (
          <>
            <div className="summary-cards">
              <div className="summary-card">
                <span className="label">누적 배당금 (세전)</span>
                <span className="value">{Math.round(dividendTotal).toLocaleString()}원</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">누적 배당금 (세후)</span>
                <span className="value">
                  {Math.round(calculateDividendTax(dividendTotal).netDividend).toLocaleString()}원
                </span>
              </div>
            </div>

            <div className="period-toggle">
              {(Object.keys(GRANULARITY_LABELS) as DividendGranularity[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={granularity === g ? 'active' : ''}
                  onClick={() => setGranularity(g)}
                >
                  {GRANULARITY_LABELS[g]}
                </button>
              ))}
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={dividendBuckets}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                  <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()}원`} />
                  <Bar dataKey="total" name="배당" fill="#3182F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <table style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>지급일</th>
                  <th>세전 수령액</th>
                  <th>메모</th>
                </tr>
              </thead>
              <tbody>
                {[...dividends]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((d) => (
                    <tr key={d.id}>
                      <td>{d.date}</td>
                      <td>{d.amount.toLocaleString()}원</td>
                      <td className="muted">{d.note ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
