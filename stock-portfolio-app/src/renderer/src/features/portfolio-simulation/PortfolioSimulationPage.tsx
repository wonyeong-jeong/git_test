import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { ContributionPlan, Holding, ManualPurchase } from '../../types'
import {
  aggregateProjections,
  projectPlanContributionGrowth,
  summarizeExpectedReturn,
  type CompoundProjectionPoint
} from '../../domain/compound'
import { deriveCurrentPosition } from '../../domain/position'
import { calculateCapitalGainsTax, type Market } from '../../domain/tax'
import { useFxRates } from '../../hooks/useFxRates'
import { formatAxisTick, formatMoney, formatQuantity } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
}

interface PlanRow {
  plan: ContributionPlan
  holding: Holding
  market: Market
  /** contributionType이 AMOUNT면 회당 금액, QUANTITY면 회당 수량(배율 적용 후) */
  scaledValue: number
  points: CompoundProjectionPoint[]
}

interface CurrencySummary {
  aggregated: CompoundProjectionPoint[]
  summary: ReturnType<typeof summarizeExpectedReturn>
}

interface AfterTaxTotals {
  totalContributed: number
  netValue: number
  taxAmount: number
}

export default function PortfolioSimulationPage({ profileId, holdings }: Props): JSX.Element {
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [monthsHorizon, setMonthsHorizon] = useState(24)
  const [amountMultiplierPercent, setAmountMultiplierPercent] = useState(100)
  const [showAfterTax, setShowAfterTax] = useState(false)
  // 원화/달러가 섞여 있을 때, 환율로 환산해서 하나로 합친 값도 같이 보고 싶을 때 켠다
  const [combineWithFx, setCombineWithFx] = useState(false)
  const { usdKrw, lastUpdated: fxLastUpdated } = useFxRates()

  useEffect(() => {
    window.api.contributionPlans.list(profileId).then(setPlans)
    window.api.manualPurchases.list(profileId).then(setPurchases)
  }, [profileId])

  const rows: PlanRow[] = useMemo(() => {
    return plans
      .map((plan) => {
        const holding = holdings.find((h) => h.id === plan.holdingId)
        if (!holding) return null
        const market: Market = holding.currency === 'USD' ? 'OVERSEAS' : 'DOMESTIC'
        const scaledValue = plan.amount * (amountMultiplierPercent / 100)
        // Holding.quantity/avgPrice는 등록 시점 값 그대로라, 그 뒤 '매매 이력'에 기록한 실제
        // 매수/매도까지 반영한 진짜 현재 포지션을 다시 계산해서 시뮬레이션 시작점으로 쓴다.
        const position = deriveCurrentPosition(
          holding,
          purchases.filter((p) => p.holdingId === holding.id)
        )
        const points = projectPlanContributionGrowth({
          contributionType: plan.contributionType,
          frequency: plan.frequency,
          value: scaledValue,
          referencePrice: position.avgPrice,
          initialPrincipal: position.totalCost,
          annualReturnRatePercent: plan.assumedAnnualReturnRate,
          months: monthsHorizon
        })
        return { plan, holding, market, scaledValue, points }
      })
      .filter((r): r is PlanRow => r !== null)
  }, [plans, holdings, purchases, monthsHorizon, amountMultiplierPercent])

  const rowsWithTax = useMemo(
    () =>
      rows.map((r) => {
        const last = r.points[r.points.length - 1]
        const tax = calculateCapitalGainsTax({
          market: r.market,
          totalContributed: last.contributed,
          projectedValue: last.value
        })
        return { ...r, last, tax }
      }),
    [rows]
  )

  // KRW와 USD를 그냥 더하면 안 되므로(환율 미지원) 통화별로 따로 합산한다 — 예전에는 여기서
  // 전부 하나로 더해버려서, 원화 종목과 달러 종목을 같이 적립하면 합계가 뒤죽박죽이었다.
  const currencies = useMemo(() => [...new Set(rows.map((r) => r.holding.currency))], [rows])

  const summaryByCurrency = useMemo(() => {
    const result: Record<string, CurrencySummary> = {}
    for (const currency of currencies) {
      const aggregated = aggregateProjections(rows.filter((r) => r.holding.currency === currency).map((r) => r.points))
      if (aggregated.length > 0) {
        result[currency] = { aggregated, summary: summarizeExpectedReturn(aggregated) }
      }
    }
    return result
  }, [rows, currencies])

  const afterTaxTotalsByCurrency = useMemo(() => {
    const result: Record<string, AfterTaxTotals> = {}
    for (const currency of currencies) {
      const currencyRows = rowsWithTax.filter((r) => r.holding.currency === currency)
      if (currencyRows.length === 0) continue
      result[currency] = currencyRows.reduce(
        (acc, r) => ({
          totalContributed: acc.totalContributed + r.last.contributed,
          netValue: acc.netValue + r.tax.netValue,
          taxAmount: acc.taxAmount + r.tax.taxAmount
        }),
        { totalContributed: 0, netValue: 0, taxAmount: 0 }
      )
    }
    return result
  }, [rowsWithTax, currencies])

  // "환율로 합쳐서 보기"가 켜져 있으면 USD 종목을 실시간 환율로 원화 환산한 뒤 전부 하나로
  // 합산한다. 통화별 카드는 그대로 유지하고, 이건 추가로 보여주는 추정치다.
  const canCombine = combineWithFx && usdKrw != null && currencies.length > 1

  const combinedKrw = useMemo(() => {
    if (!canCombine) return null
    const convertedPointsList = rows.map((r) => {
      const fx = r.holding.currency === 'USD' ? (usdKrw as number) : 1
      return r.points.map((p) => ({ month: p.month, contributed: p.contributed * fx, value: p.value * fx }))
    })
    const aggregated = aggregateProjections(convertedPointsList)
    if (aggregated.length === 0) return null
    return { aggregated, summary: summarizeExpectedReturn(aggregated) }
  }, [canCombine, rows, usdKrw])

  const combinedAfterTaxKrw = useMemo(() => {
    if (!canCombine) return null
    return rowsWithTax.reduce(
      (acc, r) => {
        const fx = r.holding.currency === 'USD' ? (usdKrw as number) : 1
        return {
          totalContributed: acc.totalContributed + r.last.contributed * fx,
          netValue: acc.netValue + r.tax.netValue * fx,
          taxAmount: acc.taxAmount + r.tax.taxAmount * fx
        }
      },
      { totalContributed: 0, netValue: 0, taxAmount: 0 }
    )
  }, [canCombine, rowsWithTax, usdKrw])

  return (
    <div>
      <div className="page-header">
        <h1>포트폴리오 합산 시뮬레이션</h1>
      </div>

      {plans.length === 0 && (
        <p className="empty-hint">
          '적립식 계획 &amp; 시뮬레이션' 탭에서 종목별 계획을 먼저 만들어야 합산 시뮬레이션을 볼 수 있어요.
        </p>
      )}

      {plans.length > 0 && currencies.length > 0 && (
        <>
          <div className="card">
            <div className="sim-controls">
              <label>
                시뮬레이션 기간: {monthsHorizon}개월
                <input
                  type="range"
                  min={1}
                  max={240}
                  value={monthsHorizon}
                  onChange={(e) => setMonthsHorizon(Number(e.target.value))}
                />
              </label>
              <label>
                전체 적립액 배율: {amountMultiplierPercent}% (모든 계획에 동일 적용)
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={10}
                  value={amountMultiplierPercent}
                  onChange={(e) => setAmountMultiplierPercent(Number(e.target.value))}
                />
              </label>
            </div>

            <label className="tax-toggle">
              <input type="checkbox" checked={showAfterTax} onChange={(e) => setShowAfterTax(e.target.checked)} />
              세후 기준으로 보기 (종목별 국내/해외 세율 자동 적용, 지금 다 매도 가정)
            </label>

            {currencies.length > 1 && (
              <>
                <p className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>
                  보유 통화가 여러 개라(KRW/USD) 기본적으로는 환율 없이 더하지 않고 통화별로 따로 합산해서 보여드려요.
                </p>
                <div className="auto-refresh-controls" style={{ marginBottom: 0 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={combineWithFx}
                      disabled={usdKrw == null}
                      onChange={(e) => setCombineWithFx(e.target.checked)}
                    />
                    환율로 환산해서 전체 하나로 합쳐 보기
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
              </>
            )}
          </div>

          {canCombine && combinedKrw && (
            <div className="card">
              <h2 style={{ marginTop: 0, fontSize: 15 }}>전체 합산 (원화 환산, 추정)</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                USD 종목을 현재 환율로 환산해서 KRW 종목과 합친 값입니다 — 실제 환전 시점 환율에 따라 달라질 수 있는
                추정치입니다.
              </p>
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="label">총 납입원금 (전체 합산)</span>
                  <span className="value">{formatMoney(combinedKrw.summary.totalContributed, 'KRW')}</span>
                </div>
                <div className="summary-card">
                  <span className="label">예상 평가금액</span>
                  <span className="value">{formatMoney(combinedKrw.summary.finalValue, 'KRW')}</span>
                </div>
                <div className="summary-card highlight">
                  <span className="label">예상 수익금</span>
                  <span className="value">{formatMoney(combinedKrw.summary.expectedProfit, 'KRW')}</span>
                </div>
                <div className="summary-card">
                  <span className="label">예상 수익률</span>
                  <span className="value">{combinedKrw.summary.expectedReturnRatePercent.toFixed(1)}%</span>
                </div>
              </div>

              {showAfterTax && combinedAfterTaxKrw && (
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="label">예상 세금 합계</span>
                    <span className="value">{formatMoney(combinedAfterTaxKrw.taxAmount, 'KRW')}</span>
                  </div>
                  <div className="summary-card highlight">
                    <span className="label">세후 실수령 평가금액</span>
                    <span className="value">{formatMoney(combinedAfterTaxKrw.netValue, 'KRW')}</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">세후 순수익</span>
                    <span className="value">
                      {formatMoney(combinedAfterTaxKrw.netValue - combinedAfterTaxKrw.totalContributed, 'KRW')}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={combinedKrw.aggregated}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                    <YAxis tickFormatter={(v) => formatAxisTick(v, 'KRW')} />
                    <Tooltip formatter={(v: number) => formatMoney(v, 'KRW')} labelFormatter={(m) => `${m}개월차`} />
                    <Legend />
                    <Line type="monotone" dataKey="contributed" name="납입원금 합산" stroke="#ADB5BD" dot={false} />
                    <Line type="monotone" dataKey="value" name="평가금액 합산" stroke="#3182F6" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {currencies.map((currency) => {
            const cs = summaryByCurrency[currency]
            if (!cs) return null
            const afterTax = afterTaxTotalsByCurrency[currency]
            return (
              <div key={currency} className="card">
                <h2 style={{ marginTop: 0, fontSize: 15 }}>{currency} 종목 합산</h2>

                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="label">총 납입원금 (해당 통화 종목 합산)</span>
                    <span className="value">{formatMoney(cs.summary.totalContributed, currency)}</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">예상 평가금액</span>
                    <span className="value">{formatMoney(cs.summary.finalValue, currency)}</span>
                  </div>
                  <div className="summary-card highlight">
                    <span className="label">예상 수익금</span>
                    <span className="value">{formatMoney(cs.summary.expectedProfit, currency)}</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">예상 수익률</span>
                    <span className="value">{cs.summary.expectedReturnRatePercent.toFixed(1)}%</span>
                  </div>
                </div>

                {showAfterTax && afterTax && (
                  <div className="summary-cards">
                    <div className="summary-card">
                      <span className="label">예상 세금 합계</span>
                      <span className="value">{formatMoney(afterTax.taxAmount, currency)}</span>
                    </div>
                    <div className="summary-card highlight">
                      <span className="label">세후 실수령 평가금액</span>
                      <span className="value">{formatMoney(afterTax.netValue, currency)}</span>
                    </div>
                    <div className="summary-card">
                      <span className="label">세후 순수익</span>
                      <span className="value">
                        {formatMoney(afterTax.netValue - afterTax.totalContributed, currency)}
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={cs.aggregated}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                      <YAxis tickFormatter={(v) => formatAxisTick(v, currency)} />
                      <Tooltip formatter={(v: number) => formatMoney(v, currency)} labelFormatter={(m) => `${m}개월차`} />
                      <Legend />
                      <Line type="monotone" dataKey="contributed" name="납입원금 합산" stroke="#ADB5BD" dot={false} />
                      <Line type="monotone" dataKey="value" name="평가금액 합산" stroke="#3182F6" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })}

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: 15 }}>종목별 구성</h2>
            <table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>시장</th>
                  <th>조정 후 회당 적립</th>
                  <th>세전 최종 평가금액</th>
                  {showAfterTax && <th>세후 최종 평가금액</th>}
                </tr>
              </thead>
              <tbody>
                {rowsWithTax.map((r) => (
                  <tr key={r.plan.id}>
                    <td>
                      {r.holding.name} <span className="muted">({r.holding.ticker})</span>
                    </td>
                    <td>{r.market === 'DOMESTIC' ? '국내' : '해외'}</td>
                    <td>
                      {r.plan.contributionType === 'QUANTITY'
                        ? `${formatQuantity(r.scaledValue)}주`
                        : formatMoney(r.scaledValue, r.holding.currency)}
                    </td>
                    <td>{formatMoney(r.last.value, r.holding.currency)}</td>
                    {showAfterTax && <td>{formatMoney(r.tax.netValue, r.holding.currency)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
