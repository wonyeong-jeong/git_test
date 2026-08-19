import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AssetSnapshot, ContributionPlan, DividendRecord, Holding, ManualPurchase } from '../../types'
import StockAvatar from '../../components/StockAvatar'
import StockPriceChart from '../../components/StockPriceChart'
import { nextScheduledEvents } from '../../domain/contributionSchedule'
import { deriveCurrentPosition } from '../../domain/position'
import { evaluatePortfolioInsights } from '../../domain/portfolioInsights'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFxRates } from '../../hooks/useFxRates'
import { formatMoney } from '../../utils/format'

/** 홈 화면 원형 그래프용 고정 순서 카테고리 팔레트 — 인접 쌍 CVD 대비를 검증해둔 값(라이트
 * 모드)이라 임의로 색을 늘리거나 순서를 바꾸지 않는다. 7개를 넘어가면 나머지는 "기타"로
 * 접어서 회색 하나로 묶는다(카테고리 색을 계속 새로 만들지 않기 위함). */
const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7']
const OTHER_COLOR = '#9ca3af'
const MAX_PIE_SLICES = 7

export type HomeNavTarget = 'plans' | 'portfolio' | 'dividends' | 'watchlist' | 'calendar' | 'assetGrowth' | 'goals'

interface Props {
  profileId: string
  holdings: Holding[]
  onOpenDetail: (holdingId: string) => void
  onNavigate: (tab: HomeNavTarget) => void
}

const QUICK_NAV: { tab: HomeNavTarget; icon: string; label: string }[] = [
  { tab: 'plans', icon: '🔁', label: '적립식 계획' },
  { tab: 'portfolio', icon: '📊', label: '포트폴리오 합산' },
  { tab: 'dividends', icon: '💰', label: '배당' },
  { tab: 'goals', icon: '🎯', label: '재무 정보 & 목표' },
  { tab: 'watchlist', icon: '⭐', label: '관심종목' },
  { tab: 'calendar', icon: '🗓️', label: '캘린더' },
  { tab: 'assetGrowth', icon: '💹', label: '자산 증식' }
]

function startOfThisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * 토스증권/네이버증권의 "홈" 화면을 참고한 대시보드 — 앱을 열면 바로 "지금 내 자산이 총
 * 얼마고, 오늘까지 얼마나 벌었는지"부터 한눈에 보여준 뒤, 나머지 탭으로 빠르게 이동할 수
 * 있게 한다. 기존 페이지들의 로직(포지션 계산·환율 합산·다음 회차 계산)을 그대로 재사용하고,
 * 이 화면 자체는 새 계산을 만들지 않는다 — 요약해서 보여주는 역할만 한다.
 */
export default function HomePage({ profileId, holdings, onOpenDetail, onNavigate }: Props): JSX.Element {
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([])
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [dividends, setDividends] = useState<DividendRecord[]>([])

  const { usdKrw } = useFxRates()

  useEffect(() => {
    window.api.manualPurchases.list(profileId).then(setPurchases)
    window.api.assetSnapshots.list(profileId).then(setSnapshots)
    window.api.contributionPlans.list(profileId).then(setPlans)
    window.api.dividends.list(profileId).then(setDividends)
  }, [profileId])

  const watched = useMemo(() => holdings.map((h) => ({ ticker: h.ticker, currency: h.currency })), [holdings])
  const { quotes, refreshNow, lastUpdated } = useAutoRefreshQuotes(watched)

  // 대시보드는 처음 열릴 때 한 번만 현재가를 조회한다 — 실시간 자동 갱신 폴링은 보유종목
  // 페이지의 역할이라 여기서까지 계속 두드리지 않는다.
  useEffect(() => {
    if (holdings.length > 0) refreshNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length])

  const positions = useMemo(
    () =>
      holdings.map((h) => {
        const position = deriveCurrentPosition(
          h,
          purchases.filter((p) => p.holdingId === h.id)
        )
        const quote = quotes[h.ticker]
        const priceKnown = quote && quote.currency === h.currency
        const price = priceKnown ? quote.lastPrice : position.avgPrice
        const value = position.quantity * price
        const plPercent = position.totalCost > 0 ? ((value - position.totalCost) / position.totalCost) * 100 : null
        return { holding: h, position, price, value, priceKnown, plPercent }
      }),
    [holdings, purchases, quotes]
  )

  const currencies = useMemo(() => [...new Set(holdings.map((h) => h.currency))], [holdings])
  // 통화가 하나뿐이면 환산 없이 정확한 값 그대로, 여러 개면(KRW/USD 혼합) 환율로 원화 환산해서
  // "총 자산" 하나의 숫자로 합친다 — 다른 페이지들과 달리 홈 화면은 큰 숫자 하나가 핵심이라
  // 기본으로 합쳐서 보여주되, 추정치라는 걸 명확히 라벨링한다.
  const needsFx = currencies.length > 1
  const fxReady = !needsFx || usdKrw != null
  const heroCurrency = needsFx ? 'KRW' : (currencies[0] ?? 'KRW')

  function fxFor(currency: string): number {
    return needsFx && currency === 'USD' ? (usdKrw as number) : 1
  }

  const totals = useMemo(() => {
    if (!fxReady) return null
    return positions.reduce(
      (acc, p) => {
        const fx = fxFor(p.holding.currency)
        return {
          totalValue: acc.totalValue + p.value * fx,
          totalCost: acc.totalCost + p.position.totalCost * fx
        }
      },
      { totalValue: 0, totalCost: 0 }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, fxReady, needsFx, usdKrw])

  const totalPL = totals ? totals.totalValue - totals.totalCost : null
  const totalPLPercent = totals && totals.totalCost > 0 ? (totalPL! / totals.totalCost) * 100 : null

  // 자산 증식 그래프(과거 시세 기반)와 별개로, 홈 화면은 하루 1번 기록되는 스냅샷만 가지고
  // 최근 추이를 작은 미니 차트로만 보여준다(가벼운 개요용) — 통화별 스냅샷을 환율로 합산.
  const trendData = useMemo(() => {
    if (!fxReady) return []
    return [...snapshots]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((s) => {
        const total = Object.entries(s.valuesByCurrency).reduce((sum, [currency, value]) => sum + value * fxFor(currency), 0)
        return { date: s.date, total }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots, fxReady, needsFx, usdKrw])

  const topHoldings = useMemo(() => [...positions].sort((a, b) => b.value - a.value).slice(0, 5), [positions])

  // 원형 그래프 & 포트폴리오 평가는 통화를 하나로(원화) 합친 값이 있어야 비중 계산이 말이
  // 된다 — fxReady가 아니면(환율 아직 로딩 중) 빈 배열로 둔다.
  const positionsKrw = useMemo(() => {
    if (!fxReady) return []
    return positions.map((p) => ({ ...p, valueKrw: p.value * fxFor(p.holding.currency) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, fxReady, needsFx, usdKrw])

  const pieData = useMemo(() => {
    const sorted = [...positionsKrw].sort((a, b) => b.valueKrw - a.valueKrw)
    const head = sorted.slice(0, MAX_PIE_SLICES).map((p, i) => ({
      name: p.holding.name,
      holdingId: p.holding.id,
      value: p.valueKrw,
      color: CATEGORY_COLORS[i]
    }))
    const rest = sorted.slice(MAX_PIE_SLICES)
    if (rest.length > 0) {
      head.push({
        name: '기타',
        holdingId: null as unknown as string,
        value: rest.reduce((sum, p) => sum + p.valueKrw, 0),
        color: OTHER_COLOR
      })
    }
    return head
  }, [positionsKrw])

  const currencyValuesKrw = useMemo(() => {
    const result: Record<string, number> = {}
    for (const p of positionsKrw) {
      result[p.holding.currency] = (result[p.holding.currency] ?? 0) + p.valueKrw
    }
    return result
  }, [positionsKrw])

  const insights = useMemo(
    () =>
      evaluatePortfolioInsights(
        positionsKrw.map((p) => ({ holdingId: p.holding.id, name: p.holding.name, valueKrw: p.valueKrw })),
        currencyValuesKrw
      ),
    [positionsKrw, currencyValuesKrw]
  )

  // 원형 그래프 조각이나 보유종목 목록을 누르면 그 종목의 실제 주가 차트를 같은 자리에 펼쳐서
  // 보여준다 — 상세 페이지로 이동하지 않아도 바로 볼 수 있게.
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null)
  const selectedHolding = holdings.find((h) => h.id === selectedHoldingId) ?? null

  function toggleSelected(holdingId: string | null): void {
    if (!holdingId) return
    setSelectedHoldingId((cur) => (cur === holdingId ? null : holdingId))
  }

  const upcomingEvents = useMemo(() => {
    return plans
      .filter((p) => p.active)
      .flatMap((p) =>
        nextScheduledEvents(
          { frequency: p.frequency, amount: p.amount, startDate: p.startDate, endDate: p.endDate, dayOfMonth: p.dayOfMonth },
          new Date().toISOString().slice(0, 10),
          1
        ).map((ev) => ({ ...ev, planName: p.name }))
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3)
  }, [plans])

  const thisMonthDividendCurrencies = useMemo(() => {
    const byHoldingCurrency = new Map(holdings.map((h) => [h.id, h.currency]))
    const result: Record<string, number> = {}
    for (const d of dividends) {
      if (d.date < startOfThisMonth()) continue
      const currency = byHoldingCurrency.get(d.holdingId) ?? 'KRW'
      result[currency] = (result[currency] ?? 0) + d.amount
    }
    return result
  }, [dividends, holdings])

  return (
    <div>
      <div className="page-header">
        <h1>홈</h1>
        {lastUpdated && <span className="muted small">{lastUpdated.toLocaleTimeString()} 기준</span>}
      </div>

      {holdings.length === 0 ? (
        <p className="empty-hint">
          아직 등록된 보유 종목이 없어요. '보유 종목' 탭에서 먼저 종목을 등록하면 여기에 자산 요약이 나타납니다.
        </p>
      ) : (
        <>
          <div className="card hero-card">
            {totals ? (
              <>
                <span className="hero-label">
                  총 자산{needsFx && <span className="muted small"> (환율 환산 추정)</span>}
                </span>
                <span className="hero-value">{formatMoney(totals.totalValue, heroCurrency)}</span>
                <span className={`hero-delta ${totalPL !== null && totalPL >= 0 ? 'num-positive' : 'num-negative'}`}>
                  {totalPL !== null && (
                    <>
                      {totalPL >= 0 ? '+' : ''}
                      {formatMoney(totalPL, heroCurrency)} ({totalPLPercent !== null ? `${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent.toFixed(2)}%` : '—'})
                    </>
                  )}
                  <span className="muted small" style={{ fontWeight: 500, color: 'var(--muted)' }}>
                    {' '}
                    누적 평가손익 (매입원가 대비)
                  </span>
                </span>

                {trendData.length > 1 && (
                  <div style={{ width: '100%', height: 90, marginTop: 18 }}>
                    <ResponsiveContainer>
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="heroTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['dataMin', 'dataMax']} />
                        <Tooltip formatter={(v: number) => formatMoney(v, heroCurrency)} labelFormatter={(d) => d} />
                        <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#heroTrend)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                환율을 불러오는 중이라 총 자산을 아직 합산할 수 없어요…
              </p>
            )}
          </div>

          <div className="home-columns">
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 15 }}>보유 비중{needsFx && <span className="muted small"> (환율 환산 추정)</span>}</h2>
              {pieData.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>환율을 불러오는 중이라 아직 비중을 계산할 수 없어요…</p>
              ) : (
                <div className="home-pie-row">
                  <div style={{ width: 200, height: 200, flexShrink: 0 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="58%"
                          outerRadius="92%"
                          paddingAngle={2}
                          stroke="var(--surface)"
                          strokeWidth={2}
                          onClick={(entry: { holdingId?: string; payload?: { holdingId?: string } }) =>
                            toggleSelected(entry.holdingId ?? entry.payload?.holdingId ?? null)
                          }
                          style={{ cursor: 'pointer' }}
                        >
                          {pieData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatMoney(v, 'KRW')} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="home-pie-legend">
                    {pieData.map((d) => (
                      <li
                        key={d.name}
                        className={d.holdingId ? 'clickable' : ''}
                        onClick={() => toggleSelected(d.holdingId)}
                      >
                        <span className="home-pie-legend-dot" style={{ background: d.color }} />
                        <span className="home-pie-legend-name">{d.name}</span>
                        <span className="muted small">{((d.value / (pieData.reduce((s, x) => s + x.value, 0) || 1)) * 100).toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.topHolding && (
                <div className="home-insights">
                  <p>
                    <strong>{insights.topHolding.name}</strong>이 전체의 <strong>{insights.topHolding.sharePercent.toFixed(1)}%</strong>를
                    차지해요 —{' '}
                    {insights.concentrationLevel === 'HIGH'
                      ? '집중도가 높은 편이에요 ⚠'
                      : insights.concentrationLevel === 'MEDIUM'
                        ? '집중도는 보통이에요'
                        : '한 종목에 쏠려있지 않아요 ✓'}
                  </p>
                  <p>
                    보유 종목 {insights.holdingCount}개 —{' '}
                    {insights.diversificationLevel === 'LOW'
                      ? '분산이 낮은 편이에요'
                      : insights.diversificationLevel === 'MEDIUM'
                        ? '분산이 적당해요'
                        : '여러 종목에 잘 나뉘어 있어요 ✓'}
                  </p>
                  {Object.keys(insights.currencySharePercent).length > 1 && (
                    <p>
                      통화 비중:{' '}
                      {Object.entries(insights.currencySharePercent)
                        .map(([c, pct]) => `${c} ${pct.toFixed(0)}%`)
                        .join(' · ')}
                    </p>
                  )}
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    정해진 기준(1위 종목 비중·보유 종목 수)으로 자동 계산한 평가입니다 — AI가 아니라 규칙 기반이에요.
                  </p>
                </div>
              )}

              {selectedHolding && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 13, marginBottom: 8 }}>{selectedHolding.name} 주가 추이 (최근 1년)</h3>
                  <StockPriceChart ticker={selectedHolding.ticker} currency={selectedHolding.currency} height={200} />
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 15 }}>보유 비중 상위 종목</h2>
              <ul className="home-holding-list">
                {topHoldings.map((p) => (
                  <li key={p.holding.id}>
                    <div className="home-holding-row" onClick={() => toggleSelected(p.holding.id)}>
                      <span className="stock-name-cell">
                        <StockAvatar ticker={p.holding.ticker} name={p.holding.name} />
                        <span>
                          <strong>{p.holding.name}</strong>
                          <span className="muted small" style={{ display: 'block' }}>
                            {p.holding.ticker}
                          </span>
                        </span>
                      </span>
                      <span className="home-holding-value">
                        <span>{formatMoney(p.value, p.holding.currency)}</span>
                        {p.plPercent !== null && (
                          <span className={`small ${p.plPercent >= 0 ? 'num-positive' : 'num-negative'}`}>
                            {p.plPercent >= 0 ? '+' : ''}
                            {p.plPercent.toFixed(1)}%
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="link-plain"
                        style={{ paddingBottom: 0 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDetail(p.holding.id)
                        }}
                      >
                        상세 →
                      </button>
                    </div>
                    {selectedHoldingId === p.holding.id && (
                      <div style={{ padding: '0 8px 12px' }}>
                        <StockPriceChart ticker={p.holding.ticker} currency={p.holding.currency} height={180} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 15 }}>다가오는 일정</h2>
              {upcomingEvents.length === 0 ? (
                <p className="empty-hint" style={{ marginBottom: 0 }}>
                  예정된 적립식 회차가 없어요.
                </p>
              ) : (
                <ul className="upcoming-list">
                  {upcomingEvents.map((ev, i) => (
                    <li key={i}>
                      {ev.date} — {ev.planName} 적립 예정
                    </li>
                  ))}
                </ul>
              )}

              <h2 style={{ fontSize: 15 }}>이번 달 배당</h2>
              {Object.keys(thisMonthDividendCurrencies).length === 0 ? (
                <p className="empty-hint" style={{ marginBottom: 0 }}>
                  이번 달에 기록된 배당이 없어요.
                </p>
              ) : (
                <div className="summary-cards" style={{ marginBottom: 0 }}>
                  {Object.entries(thisMonthDividendCurrencies).map(([currency, amount]) => (
                    <div key={currency} className="summary-card">
                      <span className="label">{currency}</span>
                      <span className="value">{formatMoney(amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>바로가기</h2>
        <div className="quick-nav-grid">
          {QUICK_NAV.map((n) => (
            <button key={n.tab} type="button" className="quick-nav-tile" onClick={() => onNavigate(n.tab)}>
              <span className="quick-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
