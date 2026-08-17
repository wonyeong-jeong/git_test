import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DividendInfo, DividendRecord, EtfSummary, Holding, ManualPurchase, StockNewsItem } from '../../types'
import { BROKER_LABELS } from '../../types'
import StockAvatar from '../../components/StockAvatar'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { useFxRates } from '../../hooks/useFxRates'
import { buildCumulativeTimeline, type CumulativeDelta } from '../../domain/assetGrowth'
import { deriveCurrentPosition } from '../../domain/position'
import { groupDividendsByPeriod, sumDividendRecords, type DividendGranularity } from '../../domain/dividend'
import { calculateDividendTax } from '../../domain/tax'
import { formatAxisTick, formatMoney } from '../../utils/format'

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
  const [showKrw, setShowKrw] = useState(false)

  const { usdKrw, lastUpdated: fxLastUpdated } = useFxRates()
  const convert = holding.currency === 'USD' && showKrw && usdKrw != null
  const fx = convert ? usdKrw : 1
  const displayCurrency = convert ? 'KRW' : holding.currency

  useEffect(() => {
    window.api.manualPurchases
      .list(profileId)
      .then((all) => setPurchases(all.filter((p) => p.holdingId === holding.id)))
    window.api.dividends.list(profileId).then((all) => setDividends(all.filter((d) => d.holdingId === holding.id)))
  }, [profileId, holding.id])

  // 종목 관련 정보(뉴스/배당 자동조회/ETF 요약) — 전부 네이버 공개 데이터라 실패해도 조용히
  // 비워두고, 이 화면의 핵심(내 보유 현황)에는 영향을 주지 않는다.
  const [news, setNews] = useState<StockNewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [autoDividendInfo, setAutoDividendInfo] = useState<DividendInfo | null>(null)
  const [etfSummary, setEtfSummary] = useState<EtfSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    setNewsLoading(true)
    window.api.marketData
      .getStockNews(holding.ticker, holding.currency, 8)
      .then((items) => !cancelled && setNews(items))
      .catch(() => !cancelled && setNews([]))
      .finally(() => !cancelled && setNewsLoading(false))
    window.api.marketData
      .getDividendInfo(holding.ticker, holding.currency)
      .then((info) => !cancelled && setAutoDividendInfo(info))
      .catch(() => !cancelled && setAutoDividendInfo(null))
    window.api.marketData
      .getEtfSummary(holding.ticker, holding.currency)
      .then((summary) => !cancelled && setEtfSummary(summary))
      .catch(() => !cancelled && setEtfSummary(null))
    return () => {
      cancelled = true
    }
  }, [holding.ticker, holding.currency])

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

  // Holding.quantity/avgPrice는 등록 시점 값 그대로라, 그 뒤 '매매 이력'에 기록한 실제
  // 매수/매도까지 반영한 진짜 현재 수량/평단가를 다시 계산해서 화면에 보여준다.
  const position = useMemo(() => deriveCurrentPosition(holding, purchases), [holding, purchases])
  const purchaseAmount = position.totalCost
  const currentValue = priceKnown ? position.quantity * quote.lastPrice : null
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

      {holding.currency === 'USD' && (
        <div className="auto-refresh-controls">
          <label>
            <input
              type="checkbox"
              checked={showKrw}
              disabled={usdKrw == null}
              onChange={(e) => setShowKrw(e.target.checked)}
            />
            원화로 환산해서 보기
          </label>
          {usdKrw != null ? (
            <span>
              적용 환율 1 USD = {usdKrw.toLocaleString()}원
              {fxLastUpdated && ` (${fxLastUpdated.toLocaleTimeString()} 기준)`}
            </span>
          ) : (
            <span className="muted">환율 불러오는 중…</span>
          )}
        </div>
      )}

      <div className="card">
        <div className="summary-cards">
          <div className="summary-card">
            <span className="label">증권사</span>
            <span className="value">{BROKER_LABELS[holding.broker]}</span>
          </div>
          <div className="summary-card">
            <span className="label">보유수량</span>
            <span className="value">{position.quantity.toLocaleString()}주</span>
          </div>
          <div className="summary-card">
            <span className="label">평단가</span>
            <span className="value">{formatMoney(position.avgPrice * fx, displayCurrency)}</span>
          </div>
          <div className="summary-card">
            <span className="label">매입금액</span>
            <span className="value">{formatMoney(purchaseAmount * fx, displayCurrency)}</span>
          </div>
          <div className={`summary-card ${flash ? `flash-${flash}` : ''}`}>
            <span className="label">현재가</span>
            <span className="value">
              {quote ? formatMoney(quote.lastPrice * (convert ? fx : 1), convert ? displayCurrency : quote.currency) : '—'}
            </span>
          </div>
          <div className="summary-card highlight">
            <span className="label">평가손익</span>
            <span className={`value ${pl === null ? '' : pl >= 0 ? 'num-positive' : 'num-negative'}`}>
              {pl === null ? '—' : `${pl >= 0 ? '+' : ''}${formatMoney(pl * fx, displayCurrency)}`}
            </span>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          등록일 {holding.createdAt.slice(0, 10)} — 위 수량·평단가·매입금액은 등록 시점 값에 '매매 이력'의 실제
          매수/매도를 반영한 현재 값입니다.
        </p>
      </div>

      {etfSummary?.isEtf && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>ETF 정보</h2>
          {etfSummary.issuerName != null ? (
            <>
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="label">운용사</span>
                  <span className="value">{etfSummary.issuerName}</span>
                </div>
                <div className="summary-card">
                  <span className="label">총보수</span>
                  <span className="value">{etfSummary.totalFeePercent?.toFixed(2)}%</span>
                </div>
                <div className="summary-card">
                  <span className="label">배당수익률 (TTM)</span>
                  <span className="value">{etfSummary.dividendYieldTtmPercent?.toFixed(2)}%</span>
                </div>
                <div className="summary-card">
                  <span className="label">NAV 괴리율</span>
                  <span className="value">{etfSummary.navDeviationPercent?.toFixed(2)}%</span>
                </div>
                <div className="summary-card">
                  <span className="label">최근 1개월 수익률</span>
                  <span className={`value ${(etfSummary.returnRate1mPercent ?? 0) >= 0 ? 'num-positive' : 'num-negative'}`}>
                    {etfSummary.returnRate1mPercent?.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-card">
                  <span className="label">최근 3개월 수익률</span>
                  <span className={`value ${(etfSummary.returnRate3mPercent ?? 0) >= 0 ? 'num-positive' : 'num-negative'}`}>
                    {etfSummary.returnRate3mPercent?.toFixed(2)}%
                  </span>
                </div>
                <div className="summary-card highlight">
                  <span className="label">최근 1년 수익률</span>
                  <span className={`value ${(etfSummary.returnRate1yPercent ?? 0) >= 0 ? 'num-positive' : 'num-negative'}`}>
                    {etfSummary.returnRate1yPercent?.toFixed(2)}%
                  </span>
                </div>
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>
                구성종목별 정확한 보유 비중은 안정적으로 조회할 수 있는 공개 API를 찾지 못해 제공하지 못합니다 — 위
                지표는 ETF 전체 요약치입니다.
              </p>
            </>
          ) : (
            <p className="muted small" style={{ marginBottom: 0 }}>
              ETF로 확인되지만, 해외 ETF는 이 데이터 출처로는 운용사·보수·수익률 같은 세부 지표를 구할 수 없습니다
              (구성종목 보유 비중도 마찬가지입니다).
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>배당 정보 (자동 조회)</h2>
        {autoDividendInfo?.dividendPerShare != null ? (
          <>
            <div className="summary-cards">
              <div className="summary-card">
                <span className="label">최근 결산 주당배당금</span>
                <span className="value">{formatMoney(autoDividendInfo.dividendPerShare, holding.currency)}</span>
              </div>
              <div className="summary-card">
                <span className="label">배당수익률</span>
                <span className="value">{autoDividendInfo.dividendYieldPercent?.toFixed(3)}%</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">보유수량 기준 예상 연간 배당금</span>
                <span className="value">{formatMoney(autoDividendInfo.dividendPerShare * position.quantity, holding.currency)}</span>
              </div>
              {autoDividendInfo.lastDividendPaidAt && (
                <div className="summary-card">
                  <span className="label">최근 배당지급일</span>
                  <span className="value">{autoDividendInfo.lastDividendPaidAt}</span>
                </div>
              )}
              {autoDividendInfo.lastExDividendAt && (
                <div className="summary-card">
                  <span className="label">최근 배당락일</span>
                  <span className="value">{autoDividendInfo.lastExDividendAt}</span>
                </div>
              )}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              네이버 금융의 최근 결산 기준 공개 데이터로 자동 계산한 추정치입니다. 아래 '과거 배당 내역'에 직접
              기록한 실제 수령액과는 다를 수 있어요(그게 진짜 정확한 기록입니다).
            </p>
          </>
        ) : (
          <p className="empty-hint">배당 정보를 찾을 수 없어요 (무배당 종목이거나 조회에 실패했을 수 있어요).</p>
        )}
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
              <YAxis tickFormatter={(v) => formatAxisTick(v * fx, displayCurrency)} />
              <Tooltip formatter={(v: number) => formatMoney(v * fx, displayCurrency)} />
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
                <span className="value">{formatMoney(dividendTotal * fx, displayCurrency)}</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">누적 배당금 (세후)</span>
                <span className="value">
                  {formatMoney(calculateDividendTax(dividendTotal).netDividend * fx, displayCurrency)}
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
                  <YAxis tickFormatter={(v) => formatAxisTick(v * fx, displayCurrency)} />
                  <Tooltip formatter={(v: number) => formatMoney(v * fx, displayCurrency)} />
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
                      <td>{formatMoney(d.amount * fx, displayCurrency)}</td>
                      <td className="muted">{d.note ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>
          종목 뉴스{newsLoading && <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>불러오는 중…</span>}
        </h2>
        {news.length === 0 ? (
          <p className="empty-hint">{newsLoading ? '조회 중이에요…' : '관련 뉴스를 찾을 수 없어요.'}</p>
        ) : (
          <ul className="upcoming-list">
            {news.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer">
                  {n.title}
                </a>{' '}
                <span className="muted small">
                  — {n.officeName} · {n.publishedAt.slice(0, 10)} {n.publishedAt.slice(11, 16)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
