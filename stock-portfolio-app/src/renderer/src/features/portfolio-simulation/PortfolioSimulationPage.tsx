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
import type { ContributionPlan, Holding } from '../../types'
import {
  aggregateProjections,
  projectPlanContributionGrowth,
  summarizeExpectedReturn,
  type CompoundProjectionPoint
} from '../../domain/compound'
import { calculateCapitalGainsTax, type Market } from '../../domain/tax'
import { formatQuantity } from '../../utils/format'

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

export default function PortfolioSimulationPage({ profileId, holdings }: Props): JSX.Element {
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [monthsHorizon, setMonthsHorizon] = useState(24)
  const [amountMultiplierPercent, setAmountMultiplierPercent] = useState(100)
  const [showAfterTax, setShowAfterTax] = useState(false)

  useEffect(() => {
    window.api.contributionPlans.list(profileId).then(setPlans)
  }, [profileId])

  const rows: PlanRow[] = useMemo(() => {
    return plans
      .map((plan) => {
        const holding = holdings.find((h) => h.id === plan.holdingId)
        if (!holding) return null
        const market: Market = holding.currency === 'USD' ? 'OVERSEAS' : 'DOMESTIC'
        const scaledValue = plan.amount * (amountMultiplierPercent / 100)
        const points = projectPlanContributionGrowth({
          contributionType: plan.contributionType,
          frequency: plan.frequency,
          value: scaledValue,
          referencePrice: holding.avgPrice,
          initialPrincipal: holding.quantity * holding.avgPrice,
          annualReturnRatePercent: plan.assumedAnnualReturnRate,
          months: monthsHorizon
        })
        return { plan, holding, market, scaledValue, points }
      })
      .filter((r): r is PlanRow => r !== null)
  }, [plans, holdings, monthsHorizon, amountMultiplierPercent])

  const aggregated = useMemo(() => aggregateProjections(rows.map((r) => r.points)), [rows])
  const summary = useMemo(() => (aggregated.length > 0 ? summarizeExpectedReturn(aggregated) : null), [aggregated])

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

  const afterTaxTotals = useMemo(() => {
    if (rowsWithTax.length === 0) return null
    return rowsWithTax.reduce(
      (acc, r) => ({
        totalContributed: acc.totalContributed + r.last.contributed,
        netValue: acc.netValue + r.tax.netValue,
        taxAmount: acc.taxAmount + r.tax.taxAmount
      }),
      { totalContributed: 0, netValue: 0, taxAmount: 0 }
    )
  }, [rowsWithTax])

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

      {plans.length > 0 && summary && (
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

            <div className="summary-cards">
              <div className="summary-card">
                <span className="label">총 납입원금 (전 종목 합산)</span>
                <span className="value">{Math.round(summary.totalContributed).toLocaleString()}원</span>
              </div>
              <div className="summary-card">
                <span className="label">예상 평가금액</span>
                <span className="value">{Math.round(summary.finalValue).toLocaleString()}원</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">예상 수익금</span>
                <span className="value">{Math.round(summary.expectedProfit).toLocaleString()}원</span>
              </div>
              <div className="summary-card">
                <span className="label">예상 수익률</span>
                <span className="value">{summary.expectedReturnRatePercent.toFixed(1)}%</span>
              </div>
            </div>

            <label className="tax-toggle">
              <input type="checkbox" checked={showAfterTax} onChange={(e) => setShowAfterTax(e.target.checked)} />
              세후 기준으로 보기 (종목별 국내/해외 세율 자동 적용, 지금 다 매도 가정)
            </label>

            {showAfterTax && afterTaxTotals && (
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="label">예상 세금 합계</span>
                  <span className="value">{Math.round(afterTaxTotals.taxAmount).toLocaleString()}원</span>
                </div>
                <div className="summary-card highlight">
                  <span className="label">세후 실수령 평가금액</span>
                  <span className="value">{Math.round(afterTaxTotals.netValue).toLocaleString()}원</span>
                </div>
                <div className="summary-card">
                  <span className="label">세후 순수익</span>
                  <span className="value">
                    {Math.round(afterTaxTotals.netValue - afterTaxTotals.totalContributed).toLocaleString()}원
                  </span>
                </div>
              </div>
            )}

            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={aggregated}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                  <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()}원`} labelFormatter={(m) => `${m}개월차`} />
                  <Legend />
                  <Line type="monotone" dataKey="contributed" name="납입원금 합산" stroke="#ADB5BD" dot={false} />
                  <Line type="monotone" dataKey="value" name="평가금액 합산" stroke="#3182F6" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

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
                        : `${Math.round(r.scaledValue).toLocaleString()}원`}
                    </td>
                    <td>{Math.round(r.last.value).toLocaleString()}원</td>
                    {showAfterTax && <td>{Math.round(r.tax.netValue).toLocaleString()}원</td>}
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
