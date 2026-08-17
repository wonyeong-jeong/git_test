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
import {
  aggregateProjections,
  monthlyEquivalentMultiplier,
  projectPlanContributionGrowth,
  summarizeExpectedReturn
} from '../../domain/compound'
import { nextScheduledEvents } from '../../domain/contributionSchedule'
import { buildHistoricalValueSeries, buildQuantityTimeline } from '../../domain/historicalValuation'
import { deriveCurrentPosition } from '../../domain/position'
import { DEFAULT_TAX_ASSUMPTIONS, calculateCapitalGainsTax, type Market } from '../../domain/tax'
import { useFxRates } from '../../hooks/useFxRates'
import { formatAxisTick, formatMoney, formatQuantity } from '../../utils/format'

/** date(YYYY-MM-DD)에 개월수를 더한다. 미래 시뮬레이션의 month 인덱스를 실제 달력 날짜로
 * 바꿔서, 과거(실제 시세 기반) 구간과 같은 날짜 축에 이어 그릴 수 있게 한다. */
function addMonthsIso(dateIso: string, months: number): string {
  const d = new Date(dateIso + 'T00:00:00')
  const targetDay = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(targetDay, daysInTargetMonth))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
  /** 해외(USD) 종목 + 금액 방식일 때만 의미 있음 — 'KRW'면 입력한 금액을 원화로 보고 저장 직전에
   * 달러로 환산한다(토스증권처럼 "원화로 얼마어치 살지" 정할 수 있게). 그 외에는 항상 'NATIVE'. */
  inputCurrency: 'NATIVE' as 'NATIVE' | 'KRW',
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
  const [fetchingDividendYield, setFetchingDividendYield] = useState(false)

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
  // 전체 계획을 원화로 합산해서 볼 기간(개월) — 아래 "전체 계획 합산" 카드 전용
  const [allPlansMonths, setAllPlansMonths] = useState(24)
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
    // ContributionPlan.amount는 항상 종목의 원래 통화(holding.currency) 기준으로 저장한다 —
    // 화면 표시/시뮬레이션 로직 전부가 그걸 전제로 짜여 있어서다. 그래서 사용자가 "원화로
    // 입력"을 골랐을 땐 저장 직전에 딱 한 번만 달러로 환산하고, 그 뒤로는 평소와 똑같이 다룬다.
    const useKrwInput = holding.currency === 'USD' && form.contributionType === 'AMOUNT' && form.inputCurrency === 'KRW'
    const amount = useKrwInput && usdKrw ? Number(form.amount) / usdKrw : Number(form.amount)
    await window.api.contributionPlans.create(profileId, {
      holdingId: holding.id,
      ticker: holding.ticker,
      name: holding.name,
      frequency: form.frequency,
      contributionType: form.contributionType,
      amount,
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

  const formHolding = holdings.find((h) => h.id === form.holdingId)
  // 해외(USD) 종목을 '금액' 방식으로 적립할 때만 "원화로 입력" 옵션을 보여준다 — 수량 방식은
  // 애초에 통화와 무관하고(몇 주인지), 국내 종목은 이미 원화라 변환할 필요가 없다.
  const canInputKrw = formHolding?.currency === 'USD' && form.contributionType === 'AMOUNT'
  const krwPreviewUsd =
    canInputKrw && form.inputCurrency === 'KRW' && usdKrw && Number(form.amount) > 0
      ? Number(form.amount) / usdKrw
      : null
  const usdPreviewKrw =
    canInputKrw && form.inputCurrency === 'NATIVE' && usdKrw && Number(form.amount) > 0
      ? Number(form.amount) * usdKrw
      : null

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

  // "지금까지 상승 그래프 + 앞으로 예상 그래프를 합쳐서" — 선택한 종목의 실제 과거 시세를
  // 가져와서, 등록일부터 오늘까지 "그 날짜에 몇 주를 들고 있었나 × 그 날짜 종가"로 실제
  // 평가금액 곡선을 복원한다(과거부터 모아온 종목도 이 구간이 전부 채워진다).
  const [historicalPoints, setHistoricalPoints] = useState<{ date: string; value: number }[]>([])
  const [historicalLoading, setHistoricalLoading] = useState(false)

  useEffect(() => {
    if (!selectedHolding) {
      setHistoricalPoints([])
      return
    }
    let cancelled = false

    async function loadHistorical(): Promise<void> {
      setHistoricalLoading(true)
      try {
        const holdingPurchases = purchases.filter((p) => p.holdingId === selectedHolding!.id)
        const earliestDate = [selectedHolding!.createdAt.slice(0, 10), ...holdingPurchases.map((p) => p.date)].sort()[0]
        const today = new Date().toISOString().slice(0, 10)
        const prices = await window.api.marketData.getHistoricalPrices(
          selectedHolding!.ticker,
          selectedHolding!.currency,
          earliestDate,
          today
        )
        if (cancelled) return
        const quantityTimeline = buildQuantityTimeline(
          selectedHolding!.createdAt.slice(0, 10),
          selectedHolding!.quantity,
          holdingPurchases.map((p) => ({ date: p.date, side: p.side, quantity: p.quantity }))
        )
        const series = buildHistoricalValueSeries([{ quantityTimeline, pricePoints: prices }])
        setHistoricalPoints(series.map((p) => ({ date: p.date, value: p.historicalValue })))
      } catch {
        // 과거 시세 조회 실패는 조용히 무시 — 이 종목은 과거 구간 없이 미래 시뮬레이션만 보인다.
        if (!cancelled) setHistoricalPoints([])
      } finally {
        if (!cancelled) setHistoricalLoading(false)
      }
    }

    loadHistorical()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHolding?.id, purchases.length])

  // 미래 시뮬레이션의 시작점(0개월차) — 실제 과거 시세를 복원했으면 그 마지막(=가장 최근) 값을
  // 쓴다(그래야 "지금까지 실제 성과"에서 이어지지, 원금으로 리셋되지 않는다). 못 구했으면 기존
  // 방식대로 투입원금을 시작값으로 쓴다.
  const lastHistoricalPoint = historicalPoints.length > 0 ? historicalPoints[historicalPoints.length - 1] : null
  const baseValue = lastHistoricalPoint?.value ?? position?.totalCost ?? 0
  const baseDate = lastHistoricalPoint?.date ?? new Date().toISOString().slice(0, 10)

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
      initialValue: baseValue,
      annualReturnRatePercent,
      months: monthsHorizon
    })
    return { points, summary: summarizeExpectedReturn(points) }
  }, [selectedPlan, selectedHolding, position, monthsHorizon, amountOverride, returnOverride, baseValue])

  // 과거(실제 시세 기반) 구간 + 미래(시뮬레이션) 구간을 하나의 날짜 축으로 합친다. 미래 쪽은
  // month 인덱스를 baseDate(=과거 구간의 마지막 날짜, 없으면 오늘) 기준 실제 날짜로 변환한다.
  const combinedChartData = useMemo(() => {
    if (!projection) return []
    const byDate = new Map<string, { date: string; actualValue?: number; projectedValue?: number; projectedContributed?: number }>()
    for (const p of historicalPoints) {
      byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), actualValue: p.value })
    }
    for (const p of projection.points) {
      const date = addMonthsIso(baseDate, p.month)
      const existing = byDate.get(date) ?? { date }
      byDate.set(date, { ...existing, projectedValue: p.value, projectedContributed: p.contributed })
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [historicalPoints, projection, baseDate])

  // 활성화된 계획 전체를 (통화 상관없이) 원화 하나로 합쳐서 보는 요약 카드용 — 종목별/통화별
  // 자세한 비교는 '포트폴리오 합산 시뮬레이션' 탭이 담당하고, 여기서는 "지금 계획대로 계속하면
  // 전체 얼마가 되는지"를 한눈에 보여주는 게 목적이라 계획마다 이미 설정된 가정수익률을 그대로 쓴다.
  const allPlansRows = useMemo(() => {
    return plans
      .filter((p) => p.active)
      .map((plan) => {
        const holding = holdings.find((h) => h.id === plan.holdingId)
        if (!holding) return null
        const holdingPurchases = purchases.filter((p) => p.holdingId === holding.id)
        const pos = deriveCurrentPosition(holding, holdingPurchases)
        const points = projectPlanContributionGrowth({
          contributionType: plan.contributionType,
          frequency: plan.frequency,
          value: plan.amount,
          referencePrice: pos.avgPrice,
          initialPrincipal: pos.totalCost,
          annualReturnRatePercent: plan.assumedAnnualReturnRate,
          months: allPlansMonths
        })
        return { plan, holding, points }
      })
      .filter((r): r is { plan: ContributionPlan; holding: Holding; points: ReturnType<typeof projectPlanContributionGrowth> } => r !== null)
  }, [plans, holdings, purchases, allPlansMonths])

  const allPlansCurrencies = useMemo(() => [...new Set(allPlansRows.map((r) => r.holding.currency))], [allPlansRows])
  const allPlansNeedFx = allPlansCurrencies.includes('USD')
  const allPlansCombinedKrw = useMemo(() => {
    if (allPlansRows.length === 0) return null
    if (allPlansNeedFx && usdKrw == null) return null
    const convertedPointsList = allPlansRows.map((r) => {
      const fx = r.holding.currency === 'USD' ? (usdKrw as number) : 1
      return r.points.map((p) => ({ month: p.month, contributed: p.contributed * fx, value: p.value * fx }))
    })
    const aggregated = aggregateProjections(convertedPointsList)
    if (aggregated.length === 0) return null
    return { aggregated, summary: summarizeExpectedReturn(aggregated) }
  }, [allPlansRows, allPlansNeedFx, usdKrw])

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
    // startDate가 과거(이미 예전부터 모아온 종목)여도 이미 지난 회차는 건너뛰고, 오늘 이후의
    // 진짜 "다음" 회차만 보여준다 — 예전엔 시작일부터 순서대로 나열해서, 과거부터 시작한
    // 계획을 누르면 몇 달 전 회차들이 "다음 예정"이라고 잘못 나왔었다.
    return nextScheduledEvents(
      {
        frequency: selectedPlan.frequency,
        amount: amountOverride ?? selectedPlan.amount,
        startDate: selectedPlan.startDate,
        endDate: selectedPlan.endDate,
        dayOfMonth: selectedPlan.dayOfMonth
      },
      new Date().toISOString().slice(0, 10),
      5
    )
  }, [selectedPlan, amountOverride])

  return (
    <div>
      <div className="page-header">
        <h1>적립식 계획 &amp; 복리 시뮬레이션</h1>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          대상 종목
          <select
            value={form.holdingId}
            onChange={(e) => {
              const nextHolding = holdings.find((h) => h.id === e.target.value)
              // USD가 아닌 종목을 고르면 "원화로 입력" 옵션이 의미가 없어지므로 원래대로 되돌린다.
              setForm({ ...form, holdingId: e.target.value, inputCurrency: nextHolding?.currency === 'USD' ? form.inputCurrency : 'NATIVE' })
            }}
          >
            <option value="">선택하세요</option>
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.ticker}) {h.currency === 'USD' ? '🇺🇸' : ''}
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
                onClick={() => setForm({ ...form, contributionType: t, inputCurrency: t === 'AMOUNT' ? form.inputCurrency : 'NATIVE' })}
              >
                {CONTRIBUTION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </label>
        {canInputKrw && (
          <label>
            입력 통화 (토스증권처럼 원화 금액으로 정할 수 있어요)
            <div className="period-toggle" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={form.inputCurrency === 'NATIVE' ? 'active' : ''}
                onClick={() => setForm({ ...form, inputCurrency: 'NATIVE' })}
              >
                달러(USD)
              </button>
              <button
                type="button"
                className={form.inputCurrency === 'KRW' ? 'active' : ''}
                disabled={usdKrw == null}
                onClick={() => setForm({ ...form, inputCurrency: 'KRW' })}
              >
                원화(KRW)
              </button>
            </div>
          </label>
        )}
        <label>
          {form.contributionType === 'QUANTITY'
            ? '회당 매수 수량 (소수점 가능)'
            : canInputKrw && form.inputCurrency === 'KRW'
              ? '회당 금액 (원화)'
              : '회당 금액'}
          <input
            type="number"
            min="0"
            step="any"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          {krwPreviewUsd != null && <span className="muted small">≈ {formatMoney(krwPreviewUsd, 'USD')} (현재 환율 기준)</span>}
          {usdPreviewKrw != null && <span className="muted small">≈ {formatMoney(usdPreviewKrw, 'KRW')} (현재 환율 기준)</span>}
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.assumedDividendYieldPercent}
              onChange={(e) => setForm({ ...form, assumedDividendYieldPercent: e.target.value })}
              placeholder="배당 없으면 0"
            />
            <button
              type="button"
              className="link-plain"
              disabled={!form.holdingId || fetchingDividendYield}
              onClick={async () => {
                if (!formHolding) return
                setFetchingDividendYield(true)
                try {
                  const info = await window.api.marketData.getDividendInfo(formHolding.ticker, formHolding.currency)
                  if (info?.dividendYieldPercent != null) {
                    setForm((f) => ({ ...f, assumedDividendYieldPercent: String(info.dividendYieldPercent) }))
                  }
                } finally {
                  setFetchingDividendYield(false)
                }
              }}
            >
              {fetchingDividendYield ? '조회 중…' : '자동 조회'}
            </button>
          </div>
        </label>
        <button type="submit" className="primary" disabled={holdings.length === 0}>
          적립식 계획 추가
        </button>
      </form>

      {holdings.length === 0 && <p className="empty-hint">먼저 '보유 종목' 탭에서 종목을 등록해야 계획을 만들 수 있어요.</p>}

      {allPlansRows.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>전체 계획 합산 (원화 환산)</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            활성화된 적립식 계획 전체를 각자의 가정수익률대로 계속 진행한다고 볼 때, 통화와 상관없이 지금 환율로 환산해서
            하나로 합친 값입니다. 종목/통화별 자세한 비교나 세후 계산은 '포트폴리오 합산 시뮬레이션' 탭에서 확인하세요.
          </p>

          <label style={{ display: 'block', marginBottom: 16 }}>
            시뮬레이션 기간: {allPlansMonths}개월
            <input
              type="range"
              min={1}
              max={240}
              value={allPlansMonths}
              onChange={(e) => setAllPlansMonths(Number(e.target.value))}
            />
          </label>

          {allPlansCombinedKrw ? (
            <>
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="label">총 납입원금 (전체 합산)</span>
                  <span className="value">{formatMoney(allPlansCombinedKrw.summary.totalContributed, 'KRW')}</span>
                </div>
                <div className="summary-card">
                  <span className="label">예상 평가금액</span>
                  <span className="value">{formatMoney(allPlansCombinedKrw.summary.finalValue, 'KRW')}</span>
                </div>
                <div className="summary-card highlight">
                  <span className="label">예상 수익금</span>
                  <span className="value">{formatMoney(allPlansCombinedKrw.summary.expectedProfit, 'KRW')}</span>
                </div>
                <div className="summary-card">
                  <span className="label">예상 수익률</span>
                  <span className="value">{allPlansCombinedKrw.summary.expectedReturnRatePercent.toFixed(1)}%</span>
                </div>
              </div>

              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={allPlansCombinedKrw.aggregated}>
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
            </>
          ) : (
            <p className="muted small">환율을 불러오는 중이라 아직 합산할 수 없어요…</p>
          )}
        </section>
      )}

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

            <p className="muted small" style={{ marginTop: -4, marginBottom: 4 }}>
              총 납입원금은 등록 시점 값에 '매매 이력'에 기록된 실제 매수/매도까지 반영해서 계산됩니다
              {position.quantity !== selectedHolding?.quantity && (
                <> (현재 {formatQuantity(position.quantity)}주, 평단가 {formatMoney(position.avgPrice, selectedHolding?.currency ?? 'KRW')})</>
              )}
              .
            </p>
            <p className="muted small" style={{ marginTop: 0 }}>
              아래 그래프의 <strong>실제 평가금액(과거)</strong>은 등록일부터 오늘까지 실제 시세로 복원한 값이고,{' '}
              <strong>예상 평가금액/납입원금(향후)</strong>은 그 마지막 지점에서 이어서 가정수익률로 미래를 시뮬레이션한
              값입니다 — 지금까지의 실제 성과와 앞으로의 예상이 하나로 이어집니다.
              {historicalLoading && ' 과거 시세 불러오는 중…'}
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
                <LineChart data={combinedChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatAxisTick(v * fx, displayCurrency)} />
                  <Tooltip formatter={(v: number) => formatMoney(v * fx, displayCurrency)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actualValue"
                    name="실제 평가금액 (과거, 실제 시세 기반)"
                    stroke="#12B886"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedContributed"
                    name="예상 납입원금 (향후)"
                    stroke="#ADB5BD"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedValue"
                    name="예상 평가금액 (향후)"
                    stroke="#3182F6"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
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
