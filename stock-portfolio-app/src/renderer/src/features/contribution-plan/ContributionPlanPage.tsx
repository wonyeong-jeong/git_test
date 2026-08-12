import { FormEvent, useEffect, useMemo, useState } from 'react'
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
import type { ContributionFrequency, ContributionPlan, Holding } from '../../types'
import { projectContributionGrowth, summarizeExpectedReturn } from '../../domain/compound'
import { generateScheduleEvents } from '../../domain/contributionSchedule'
import { DEFAULT_TAX_ASSUMPTIONS, calculateCapitalGainsTax, type Market } from '../../domain/tax'

interface Props {
  profileId: string
  holdings: Holding[]
}

const emptyForm = {
  holdingId: '',
  frequency: 'MONTHLY' as ContributionFrequency,
  amount: '300000',
  dayOfMonth: '1',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  assumedAnnualReturnRate: '7',
  assumedDividendYieldPercent: '0'
}

export default function ContributionPlanPage({ profileId, holdings }: Props): JSX.Element {
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [form, setForm] = useState(emptyForm)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  // what-if 조정용 상태 (목표3): 기본값은 계획값 그대로, 사용자가 바꾸면 즉시 재계산
  const [monthsHorizon, setMonthsHorizon] = useState(24)
  const [amountOverride, setAmountOverride] = useState<number | null>(null)
  const [returnOverride, setReturnOverride] = useState<number | null>(null)

  // 세후 시뮬레이션 (Phase 3): 해외주식일 때만 조정 가능한 세율/공제
  const [showAfterTax, setShowAfterTax] = useState(false)
  const [overseasTaxRate, setOverseasTaxRate] = useState(DEFAULT_TAX_ASSUMPTIONS.overseasCapitalGainsTaxRatePercent)
  const [overseasDeduction, setOverseasDeduction] = useState(
    DEFAULT_TAX_ASSUMPTIONS.overseasCapitalGainsBasicDeductionKRW
  )

  async function refresh(): Promise<void> {
    const list = await window.api.contributionPlans.list(profileId)
    setPlans(list)
  }

  useEffect(() => {
    refresh()
  }, [profileId])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.holdingId) return
    const holding = holdings.find((h) => h.id === form.holdingId)
    if (!holding) return
    await window.api.contributionPlans.create(profileId, {
      holdingId: holding.id,
      ticker: holding.ticker,
      name: holding.name,
      frequency: form.frequency,
      amount: Number(form.amount),
      dayOfMonth: form.frequency === 'MONTHLY' ? Number(form.dayOfMonth) : undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      assumedAnnualReturnRate: Number(form.assumedAnnualReturnRate),
      assumedDividendYieldPercent: Number(form.assumedDividendYieldPercent),
      active: true
    })
    setForm(emptyForm)
    refresh()
  }

  async function handleDelete(planId: string): Promise<void> {
    await window.api.contributionPlans.delete(profileId, planId)
    if (selectedPlanId === planId) setSelectedPlanId(null)
    refresh()
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null
  const selectedHolding = selectedPlan ? holdings.find((h) => h.id === selectedPlan.holdingId) : null

  const projection = useMemo(() => {
    if (!selectedPlan || !selectedHolding) return null
    const initialPrincipal = selectedHolding.quantity * selectedHolding.avgPrice
    const monthlyContribution = amountOverride ?? selectedPlan.amount
    const annualReturnRatePercent = returnOverride ?? selectedPlan.assumedAnnualReturnRate
    const points = projectContributionGrowth({
      initialPrincipal,
      monthlyContribution,
      annualReturnRatePercent,
      months: monthsHorizon
    })
    return { points, summary: summarizeExpectedReturn(points) }
  }, [selectedPlan, selectedHolding, monthsHorizon, amountOverride, returnOverride])

  const market: Market = selectedHolding?.currency === 'USD' ? 'OVERSEAS' : 'DOMESTIC'

  const capitalGains = useMemo(() => {
    if (!projection) return null
    return calculateCapitalGainsTax({
      market,
      totalContributed: projection.summary.totalContributed,
      projectedValue: projection.summary.finalValue,
      assumptions: {
        overseasCapitalGainsTaxRatePercent: overseasTaxRate,
        overseasCapitalGainsBasicDeductionKRW: overseasDeduction
      }
    })
  }, [projection, market, overseasTaxRate, overseasDeduction])

  const upcomingEvents = useMemo(() => {
    if (!selectedPlan) return []
    return generateScheduleEvents(
      {
        frequency: selectedPlan.frequency,
        amount: amountOverride ?? selectedPlan.amount,
        startDate: selectedPlan.startDate,
        endDate: selectedPlan.endDate,
        dayOfMonth: selectedPlan.dayOfMonth
      },
      3
    ).slice(0, 5)
  }, [selectedPlan, amountOverride])

  return (
    <div>
      <div className="page-header">
        <h1>적립식 계획 &amp; 복리 시뮬레이션</h1>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          대상 종목
          <select value={form.holdingId} onChange={(e) => setForm({ ...form, holdingId: e.target.value })}>
            <option value="">선택하세요</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.ticker})
              </option>
            ))}
          </select>
        </label>
        <label>
          주기
          <select
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value as ContributionFrequency })}
          >
            <option value="MONTHLY">매월</option>
            <option value="WEEKLY">매주</option>
          </select>
        </label>
        <label>
          회당 금액
          <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        {form.frequency === 'MONTHLY' && (
          <label>
            매월 며칠
            <input
              type="number"
              min="1"
              max="31"
              value={form.dayOfMonth}
              onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
            />
          </label>
        )}
        <label>
          시작일
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </label>
        <label>
          종료일 (선택)
          <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </label>
        <label>
          가정 연 수익률(%)
          <input
            type="number"
            step="0.1"
            value={form.assumedAnnualReturnRate}
            onChange={(e) => setForm({ ...form, assumedAnnualReturnRate: e.target.value })}
          />
        </label>
        <label>
          가정 연 배당수익률(%)
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.assumedDividendYieldPercent}
            onChange={(e) => setForm({ ...form, assumedDividendYieldPercent: e.target.value })}
            placeholder="배당 없으면 0"
          />
        </label>
        <button type="submit" className="primary" disabled={holdings.length === 0}>
          적립식 계획 추가
        </button>
      </form>

      {holdings.length === 0 && <p className="empty-hint">먼저 '보유 종목' 탭에서 종목을 등록해야 계획을 만들 수 있어요.</p>}

      <div className="plan-layout">
        <section className="plan-list">
          {plans.map((p) => (
            <button
              key={p.id}
              className={`plan-card ${selectedPlanId === p.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedPlanId(p.id)
                setAmountOverride(null)
                setReturnOverride(null)
                setMonthsHorizon(24)
              }}
            >
              <strong>{p.name}</strong>
              <span className="muted">
                {p.frequency === 'MONTHLY' ? '매월' : '매주'} {p.amount.toLocaleString()}원 · 가정수익률 {p.assumedAnnualReturnRate}%
              </span>
              <span className="link-danger" onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}>
                삭제
              </span>
            </button>
          ))}
          {plans.length === 0 && <p className="empty-hint">등록된 적립식 계획이 없습니다.</p>}
        </section>

        {selectedPlan && projection && (
          <section className="card simulation-panel">
            <h2>{selectedPlan.name} — 기간/금액 조정 시뮬레이션</h2>

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
                월 적립액: {(amountOverride ?? selectedPlan.amount).toLocaleString()}원
                <input
                  type="range"
                  min={0}
                  max={Math.max(selectedPlan.amount * 5, 1_000_000)}
                  step={10000}
                  value={amountOverride ?? selectedPlan.amount}
                  onChange={(e) => setAmountOverride(Number(e.target.value))}
                />
              </label>
              <label>
                가정 연 수익률: {(returnOverride ?? selectedPlan.assumedAnnualReturnRate).toFixed(1)}%
                <input
                  type="range"
                  min={-10}
                  max={30}
                  step={0.5}
                  value={returnOverride ?? selectedPlan.assumedAnnualReturnRate}
                  onChange={(e) => setReturnOverride(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="summary-cards">
              <div className="summary-card">
                <span className="label">총 납입원금</span>
                <span className="value">{Math.round(projection.summary.totalContributed).toLocaleString()}원</span>
              </div>
              <div className="summary-card">
                <span className="label">예상 평가금액</span>
                <span className="value">{Math.round(projection.summary.finalValue).toLocaleString()}원</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">예상 수익금</span>
                <span className="value">{Math.round(projection.summary.expectedProfit).toLocaleString()}원</span>
              </div>
              <div className="summary-card">
                <span className="label">예상 수익률</span>
                <span className="value">{projection.summary.expectedReturnRatePercent.toFixed(1)}%</span>
              </div>
            </div>

            <label className="tax-toggle">
              <input type="checkbox" checked={showAfterTax} onChange={(e) => setShowAfterTax(e.target.checked)} />
              세후 기준으로 보기 (지금 다 매도한다고 가정)
            </label>

            {showAfterTax && capitalGains && (
              <div className="card tax-panel">
                {market === 'DOMESTIC' ? (
                  <p className="muted small" style={{ marginTop: 0 }}>
                    국내 상장주식은 소액주주 매매차익 비과세로 가정합니다 (대주주 요건 해당 시 다를 수 있음 — 세무 상담
                    권장).
                  </p>
                ) : (
                  <div className="sim-controls" style={{ marginBottom: 16 }}>
                    <label>
                      해외주식 양도세율: {overseasTaxRate}%
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={0.5}
                        value={overseasTaxRate}
                        onChange={(e) => setOverseasTaxRate(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      연 기본공제: {overseasDeduction.toLocaleString()}원
                      <input
                        type="range"
                        min={0}
                        max={5_000_000}
                        step={100000}
                        value={overseasDeduction}
                        onChange={(e) => setOverseasDeduction(Number(e.target.value))}
                      />
                    </label>
                  </div>
                )}
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="label">예상 양도소득세</span>
                    <span className="value">{Math.round(capitalGains.taxAmount).toLocaleString()}원</span>
                  </div>
                  <div className="summary-card highlight">
                    <span className="label">세후 순수익</span>
                    <span className="value">{Math.round(capitalGains.netProfit).toLocaleString()}원</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">세후 실수령 평가금액</span>
                    <span className="value">{Math.round(capitalGains.netValue).toLocaleString()}원</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">실효세율</span>
                    <span className="value">{capitalGains.effectiveTaxRatePercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={projection.points}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                  <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()}원`} labelFormatter={(m) => `${m}개월차`} />
                  <Legend />
                  <Line type="monotone" dataKey="contributed" name="납입원금" stroke="#8884d8" dot={false} />
                  <Line type="monotone" dataKey="value" name="평가금액" stroke="#2f9e44" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3>다음 예정 매수 회차 (자동 생성)</h3>
              <ul className="upcoming-list">
                {upcomingEvents.map((ev) => (
                  <li key={ev.date}>
                    {ev.date} — {ev.plannedAmount.toLocaleString()}원 예정
                  </li>
                ))}
              </ul>
              <p className="muted small">
                실제 매수는 증권사 앱에서 직접 진행하고, 체결 결과는 추후 '추가매수 기록' 기능으로 입력합니다.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
