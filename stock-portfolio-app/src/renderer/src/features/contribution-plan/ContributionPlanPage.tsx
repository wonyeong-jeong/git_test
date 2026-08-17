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
import type { ContributionFrequency, ContributionPlan, ContributionValueType, Holding, ManualPurchase } from '../../types'
import { monthlyEquivalentMultiplier, projectPlanContributionGrowth, summarizeExpectedReturn } from '../../domain/compound'
import { generateScheduleEvents } from '../../domain/contributionSchedule'
import { deriveCurrentPosition } from '../../domain/position'
import { DEFAULT_TAX_ASSUMPTIONS, calculateCapitalGainsTax, type Market } from '../../domain/tax'
import { useFxRates } from '../../hooks/useFxRates'
import { formatAxisTick, formatMoney, formatQuantity } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
}

const CONTRIBUTION_TYPE_LABELS: Record<ContributionValueType, string> = { AMOUNT: '금액', QUANTITY: '수량' }

const emptyForm = {
  holdingId: '',
  frequency: 'MONTHLY' as ContributionFrequency,
  contributionType: 'AMOUNT' as ContributionValueType,
  amount: '300000',
  dayOfMonth: '1',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  assumedAnnualReturnRate: '7',
  assumedDividendYieldPercent: '0'
}

export default function ContributionPlanPage({ profileId, holdings }: Props): JSX.Element {
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
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

  // USD 종목을 원화로 환산해서 볼지 여부
  const [showKrw, setShowKrw] = useState(false)
  const { usdKrw, lastUpdated: fxLastUpdated } = useFxRates()

  async function refresh(): Promise<void> {
    const list = await window.api.contributionPlans.list(profileId)
    setPlans(list)
  }

  useEffect(() => {
    refresh()
    window.api.manualPurchases.list(profileId).then(setPurchases)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      contributionType: form.contributionType,
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

  // Holding.quantity/avgPrice는 종목 등록 시점 값 그대로 고정이라, 그 뒤 '매매 이력'에 기록한
  // 추가 매수/매도는 반영되지 않는다 — 그래서 지금까지의 실제 매매 기록을 다시 적용해서
  // "진짜 지금" 수량/평단가/투입원금을 계산한다. 이게 시뮬레이션의 시작점이 된다.
  const position = useMemo(() => {
    if (!selectedHolding) return null
    const holdingPurchases = purchases.filter((p) => p.holdingId === selectedHolding.id)
    return deriveCurrentPosition(selectedHolding, holdingPurchases)
  }, [selectedHolding, purchases])

  const convert = selectedHolding?.currency === 'USD' && showKrw && usdKrw != null
  const fx = convert ? usdKrw : 1
  const displayCurrency = convert ? 'KRW' : (selectedHolding?.currency ?? 'KRW')

  const projection = useMemo(() => {
    if (!selectedPlan || !selectedHolding || !position) return null
    const value = amountOverride ?? selectedPlan.amount
    const annualReturnRatePercent = returnOverride ?? selectedPlan.assumedAnnualReturnRate
    const points = projectPlanContributionGrowth({
      contributionType: selectedPlan.contributionType,
      frequency: selectedPlan.frequency,
      value,
      referencePrice: position.avgPrice,
      initialPrincipal: position.totalCost,
      annualReturnRatePercent,
      months: monthsHorizon
    })
    return { points, summary: summarizeExpectedReturn(points) }
  }, [selectedPlan, selectedHolding, position, monthsHorizon, amountOverride, returnOverride])

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
          적립 방식
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            {(Object.keys(CONTRIBUTION_TYPE_LABELS) as ContributionValueType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={form.contributionType === t ? 'active' : ''}
                onClick={() => setForm({ ...form, contributionType: t })}
              >
                {CONTRIBUTION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </label>
        <label>
          {form.contributionType === 'QUANTITY' ? '회당 매수 수량 (소수점 가능)' : '회당 금액'}
          <input
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
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
          {plans.map((p) => {
            const planHolding = holdings.find((h) => h.id === p.holdingId)
            return (
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
                {p.frequency === 'MONTHLY' ? '매월' : '매주'}{' '}
                {p.contributionType === 'QUANTITY'
                  ? `${formatQuantity(p.amount)}주`
                  : formatMoney(p.amount, planHolding?.currency ?? 'KRW')}{' '}
                · 가정수익률 {p.assumedAnnualReturnRate}%
              </span>
              <span className="link-danger" onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}>
                삭제
              </span>
            </button>
            )
          })}
          {plans.length === 0 && <p className="empty-hint">등록된 적립식 계획이 없습니다.</p>}
        </section>

        {selectedPlan && projection && position && (
          <section className="card simulation-panel">
            <h2>{selectedPlan.name} — 기간/금액 조정 시뮬레이션</h2>

            <p className="muted small" style={{ marginTop: -4 }}>
              총 납입원금은 등록 시점 값에 '매매 이력'에 기록된 실제 매수/매도까지 반영해서 계산됩니다
              {position.quantity !== selectedHolding?.quantity && (
                <> (현재 {formatQuantity(position.quantity)}주, 평단가 {formatMoney(position.avgPrice, selectedHolding?.currency ?? 'KRW')})</>
              )}
              .
            </p>

            {selectedHolding?.currency === 'USD' && (
              <div className="auto-refresh-controls" style={{ marginBottom: 16 }}>
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
                {selectedPlan.contributionType === 'QUANTITY' ? '회당 매수 수량' : '회당 적립액'}:{' '}
                {selectedPlan.contributionType === 'QUANTITY'
                  ? `${formatQuantity(amountOverride ?? selectedPlan.amount)}주`
                  : formatMoney((amountOverride ?? selectedPlan.amount) * fx, displayCurrency)}
                <input
                  type="range"
                  min={0}
                  max={
                    selectedPlan.contributionType === 'QUANTITY'
                      ? Math.max(selectedPlan.amount * 5, 10)
                      : Math.max(selectedPlan.amount * 5, 1_000_000)
                  }
                  step={selectedPlan.contributionType === 'QUANTITY' ? 0.1 : 10000}
                  value={amountOverride ?? selectedPlan.amount}
                  onChange={(e) => setAmountOverride(Number(e.target.value))}
                />
                {selectedPlan.frequency === 'WEEKLY' && (
                  <span className="muted small">
                    매주 적립 → 월 환산 약{' '}
                    {selectedPlan.contributionType === 'QUANTITY'
                      ? `${formatQuantity((amountOverride ?? selectedPlan.amount) * monthlyEquivalentMultiplier('WEEKLY'))}주`
                      : formatMoney(
                          (amountOverride ?? selectedPlan.amount) * monthlyEquivalentMultiplier('WEEKLY') * fx,
                          displayCurrency
                        )}
                    {' '}(1개월 ≈ 4.35주로 계산)
                  </span>
                )}
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
                <span className="value">{formatMoney(projection.summary.totalContributed * fx, displayCurrency)}</span>
              </div>
              <div className="summary-card">
                <span className="label">예상 평가금액</span>
                <span className="value">{formatMoney(projection.summary.finalValue * fx, displayCurrency)}</span>
              </div>
              <div className="summary-card highlight">
                <span className="label">예상 수익금</span>
                <span className="value">{formatMoney(projection.summary.expectedProfit * fx, displayCurrency)}</span>
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
                    {selectedHolding?.currency !== 'KRW' && (
                      <p className="muted small" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                        ⚠ 기본공제는 세법상 원화 기준 금액이라, {selectedHolding?.currency ?? '외화'} 손익에서 환율
                        변환 없이 그대로 뺀 값입니다 — 정확한 세액은 실제 환전 시점 환율로 다시 계산해야 합니다.
                      </p>
                    )}
                  </div>
                )}
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="label">예상 양도소득세</span>
                    <span className="value">{formatMoney(capitalGains.taxAmount * fx, displayCurrency)}</span>
                  </div>
                  <div className="summary-card highlight">
                    <span className="label">세후 순수익</span>
                    <span className="value">{formatMoney(capitalGains.netProfit * fx, displayCurrency)}</span>
                  </div>
                  <div className="summary-card">
                    <span className="label">세후 실수령 평가금액</span>
                    <span className="value">{formatMoney(capitalGains.netValue * fx, displayCurrency)}</span>
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
                  <YAxis tickFormatter={(v) => formatAxisTick(v * fx, displayCurrency)} />
                  <Tooltip
                    formatter={(v: number) => formatMoney(v * fx, displayCurrency)}
                    labelFormatter={(m) => `${m}개월차`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="contributed" name="납입원금" stroke="#ADB5BD" dot={false} />
                  <Line type="monotone" dataKey="value" name="평가금액" stroke="#3182F6" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3>다음 예정 매수 회차 (자동 생성)</h3>
              <ul className="upcoming-list">
                {upcomingEvents.map((ev) => (
                  <li key={ev.date}>
                    {ev.date} —{' '}
                    {selectedPlan.contributionType === 'QUANTITY'
                      ? `${formatQuantity(ev.plannedAmount)}주`
                      : formatMoney(ev.plannedAmount * fx, displayCurrency)}{' '}
                    예정
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
