import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { ContributionPlan, DividendInfo, DividendRecord, Holding, ManualPurchase } from '../../types'
import { projectPlanContributionGrowth } from '../../domain/compound'
import {
  aggregateDividendProjections,
  groupDividendsByPeriod,
  projectExpectedDividends,
  sumDividendRecords,
  type DividendGranularity
} from '../../domain/dividend'
import { deriveCurrentPosition } from '../../domain/position'
import { calculateDividendTax } from '../../domain/tax'
import { useFxRates } from '../../hooks/useFxRates'
import { formatAxisTick, formatMoney, formatQuantity } from '../../utils/format'

const GRANULARITY_LABELS: Record<DividendGranularity, string> = { WEEK: '주간', MONTH: '월간', YEAR: '연간' }
/** 구간이 너무 많아지면 막대그래프가 읽기 어려워지므로 최근 N개만 보여준다 */
const MAX_BUCKETS_SHOWN = 12

interface Props {
  profileId: string
  holdings: Holding[]
}

const emptyForm = {
  holdingId: '',
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  note: ''
}

function startOfThisYear(): string {
  return `${new Date().getFullYear()}-01-01`
}

interface DividendTotals {
  allTimeGross: number
  allTimeNet: number
  ytdGross: number
  ytdNet: number
}

export default function DividendsPage({ profileId, holdings }: Props): JSX.Element {
  const [records, setRecords] = useState<DividendRecord[]>([])
  const [plans, setPlans] = useState<ContributionPlan[]>([])
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [form, setForm] = useState(emptyForm)

  const [monthsHorizon, setMonthsHorizon] = useState(24)
  const [amountMultiplierPercent, setAmountMultiplierPercent] = useState(100)
  const [granularity, setGranularity] = useState<DividendGranularity>('MONTH')
  // 원화/달러가 섞여 있을 때, 환율로 환산해서 하나로 합친 값도 같이 보고 싶을 때 켠다
  const [combineWithFx, setCombineWithFx] = useState(false)
  const { usdKrw, lastUpdated: fxLastUpdated } = useFxRates()

  // "받은 배당/앞으로 받을 배당을 자동으로 계산" — 종목별 실제 배당 데이터(최근 결산 기준 주당
  // 배당금·배당수익률)를 네이버에서 조회해서, 사용자가 가정 배당수익률을 직접 입력하지 않아도
  // 지금 보유수량 기준 예상 연간 배당금을 자동으로 계산해 보여준다.
  const [dividendInfoByHolding, setDividendInfoByHolding] = useState<Record<string, DividendInfo | null>>({})
  const [dividendInfoLoading, setDividendInfoLoading] = useState(false)

  async function refreshRecords(): Promise<void> {
    setRecords(await window.api.dividends.list(profileId))
  }

  useEffect(() => {
    refreshRecords()
    window.api.contributionPlans.list(profileId).then(setPlans)
    window.api.manualPurchases.list(profileId).then(setPurchases)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  useEffect(() => {
    if (holdings.length === 0) return
    let cancelled = false

    async function loadDividendInfo(): Promise<void> {
      setDividendInfoLoading(true)
      const results = await Promise.allSettled(
        holdings.map(async (h) => ({ holdingId: h.id, info: await window.api.marketData.getDividendInfo(h.ticker, h.currency) }))
      )
      if (cancelled) return
      const byHolding: Record<string, DividendInfo | null> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') byHolding[r.value.holdingId] = r.value.info
        // 실패한 종목은 그냥 빠진다 — 아래에서 정보 없음으로 처리된다.
      }
      setDividendInfoByHolding(byHolding)
      setDividendInfoLoading(false)
    }

    loadDividendInfo()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, holdings.length])

  // 현재 보유수량(매매 이력까지 반영) × 종목별 자동 조회된 주당배당금 = 자동 계산된 예상 연간
  // 배당금. 주당배당금을 못 구했으면 배당수익률 × 평단가로 대신 추정한다(둘 다 없으면 배당이
  // 없거나 데이터를 못 가져온 것으로 보고 제외).
  const autoDividendRows = useMemo(() => {
    return holdings
      .map((h) => {
        const position = deriveCurrentPosition(
          h,
          purchases.filter((p) => p.holdingId === h.id)
        )
        if (position.quantity <= 0) return null
        const info = dividendInfoByHolding[h.id]
        if (!info) return null
        const perShare = info.dividendPerShare ?? (info.dividendYieldPercent != null ? (position.avgPrice * info.dividendYieldPercent) / 100 : null)
        if (perShare == null) return null
        return { holding: h, position, info, expectedAnnualDividend: perShare * position.quantity }
      })
      .filter((r): r is { holding: Holding; position: ReturnType<typeof deriveCurrentPosition>; info: DividendInfo; expectedAnnualDividend: number } => r !== null)
  }, [holdings, purchases, dividendInfoByHolding])

  const autoDividendCurrencies = useMemo(() => [...new Set(autoDividendRows.map((r) => r.holding.currency))], [autoDividendRows])

  const autoDividendTotalsByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    for (const currency of autoDividendCurrencies) {
      result[currency] = autoDividendRows
        .filter((r) => r.holding.currency === currency)
        .reduce((sum, r) => sum + r.expectedAnnualDividend, 0)
    }
    return result
  }, [autoDividendRows, autoDividendCurrencies])

  const canCombineAuto = combineWithFx && usdKrw != null && autoDividendCurrencies.length > 1
  const autoDividendCombinedKrw = useMemo(() => {
    if (!canCombineAuto) return null
    return autoDividendRows.reduce((sum, r) => {
      const fx = r.holding.currency === 'USD' ? (usdKrw as number) : 1
      return sum + r.expectedAnnualDividend * fx
    }, 0)
  }, [canCombineAuto, autoDividendRows, usdKrw])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.holdingId || !form.amount) return
    await window.api.dividends.create(profileId, {
      holdingId: form.holdingId,
      date: form.date,
      amount: Number(form.amount),
      note: form.note || undefined
    })
    setForm(emptyForm)
    refreshRecords()
  }

  async function handleDelete(id: string): Promise<void> {
    await window.api.dividends.delete(profileId, id)
    refreshRecords()
  }

  function holdingName(holdingId: string): string {
    const h = holdings.find((x) => x.id === holdingId)
    return h ? `${h.name} (${h.ticker})` : '(삭제된 종목)'
  }

  function holdingCurrency(holdingId: string): string {
    return holdings.find((h) => h.id === holdingId)?.currency ?? 'KRW'
  }

  // KRW와 USD 배당을 그냥 더하면 안 되므로(환율 미지원) 전부 통화별로 따로 계산한다 —
  // 예전에는 전 종목 배당을 통화 구분 없이 그냥 더해서 "원"이라고만 표시했다.
  const currenciesWithDividends = useMemo(
    () => [...new Set(records.map((r) => holdingCurrency(r.holdingId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, holdings]
  )

  const totalsByCurrency = useMemo(() => {
    const result: Record<string, DividendTotals> = {}
    for (const currency of currenciesWithDividends) {
      const currencyRecords = records.filter((r) => holdingCurrency(r.holdingId) === currency)
      const allTime = sumDividendRecords(currencyRecords)
      const ytd = sumDividendRecords(currencyRecords, startOfThisYear())
      result[currency] = {
        allTimeGross: allTime,
        allTimeNet: calculateDividendTax(allTime).netDividend,
        ytdGross: ytd,
        ytdNet: calculateDividendTax(ytd).netDividend
      }
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, holdings, currenciesWithDividends])

  const periodBucketsByCurrency = useMemo(() => {
    const result: Record<string, ReturnType<typeof groupDividendsByPeriod>> = {}
    for (const currency of currenciesWithDividends) {
      const currencyRecords = records.filter((r) => holdingCurrency(r.holdingId) === currency)
      result[currency] = groupDividendsByPeriod(currencyRecords, granularity).slice(-MAX_BUCKETS_SHOWN)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, holdings, granularity, currenciesWithDividends])

  const dividendPlans = plans.filter((p) => p.assumedDividendYieldPercent > 0)

  const currenciesWithDividendPlans = useMemo(
    () => [...new Set(dividendPlans.map((p) => holdingCurrency(p.holdingId)))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividendPlans, holdings]
  )

  const dividendProjectionByCurrency = useMemo(() => {
    const result: Record<string, ReturnType<typeof aggregateDividendProjections>> = {}
    for (const currency of currenciesWithDividendPlans) {
      const perPlan = dividendPlans
        .filter((plan) => holdingCurrency(plan.holdingId) === currency)
        .map((plan) => {
          const holding = holdings.find((h) => h.id === plan.holdingId)
          if (!holding) return null
          // Holding.quantity/avgPrice는 등록 시점 값 그대로라, 그 뒤 '매매 이력'에 기록한 실제
          // 매수/매도까지 반영한 진짜 현재 포지션을 다시 계산해서 시뮬레이션 시작점으로 쓴다.
          const position = deriveCurrentPosition(
            holding,
            purchases.filter((p) => p.holdingId === holding.id)
          )
          const growth = projectPlanContributionGrowth({
            contributionType: plan.contributionType,
            frequency: plan.frequency,
            value: plan.amount * (amountMultiplierPercent / 100),
            referencePrice: position.avgPrice,
            initialPrincipal: position.totalCost,
            annualReturnRatePercent: plan.assumedAnnualReturnRate,
            months: monthsHorizon
          })
          return projectExpectedDividends(growth, plan.assumedDividendYieldPercent)
        })
        .filter((p): p is ReturnType<typeof projectExpectedDividends> => p !== null)
      result[currency] = aggregateDividendProjections(perPlan)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividendPlans, holdings, purchases, monthsHorizon, amountMultiplierPercent, currenciesWithDividendPlans])

  const canCombine = combineWithFx && usdKrw != null

  const combinedTotalsKrw = useMemo(() => {
    if (!canCombine || currenciesWithDividends.length < 2) return null
    return currenciesWithDividends.reduce(
      (acc, currency) => {
        const t = totalsByCurrency[currency]
        const fx = currency === 'USD' ? (usdKrw as number) : 1
        return {
          allTimeGross: acc.allTimeGross + t.allTimeGross * fx,
          allTimeNet: acc.allTimeNet + t.allTimeNet * fx,
          ytdGross: acc.ytdGross + t.ytdGross * fx,
          ytdNet: acc.ytdNet + t.ytdNet * fx
        }
      },
      { allTimeGross: 0, allTimeNet: 0, ytdGross: 0, ytdNet: 0 }
    )
  }, [canCombine, currenciesWithDividends, totalsByCurrency, usdKrw])

  const combinedDividendProjectionKrw = useMemo(() => {
    if (!canCombine || currenciesWithDividendPlans.length < 2) return null
    const converted = currenciesWithDividendPlans.map((currency) => {
      const fx = currency === 'USD' ? (usdKrw as number) : 1
      return dividendProjectionByCurrency[currency].map((p) => ({
        month: p.month,
        expectedAnnualDividend: p.expectedAnnualDividend * fx
      }))
    })
    return aggregateDividendProjections(converted)
  }, [canCombine, currenciesWithDividendPlans, dividendProjectionByCurrency, usdKrw])

  return (
    <div>
      <div className="page-header">
        <h1>배당</h1>
      </div>

      {(currenciesWithDividends.length > 1 || autoDividendCurrencies.length > 1) && (
        <>
          <p className="muted small" style={{ marginTop: -8, marginBottom: 12 }}>
            보유 통화가 여러 개라(KRW/USD) 기본적으로는 환율 없이 더하지 않고 통화별로 따로 집계해서 보여드려요.
          </p>
          <div className="auto-refresh-controls">
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

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>
          자동 계산된 예상 연간 배당금
          {dividendInfoLoading && <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>배당 데이터 조회 중…</span>}
        </h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          가정 배당수익률을 직접 입력하지 않아도, 지금 보유 중인 종목의 최근 결산 기준 실제 주당배당금(네이버 금융
          공개 데이터) × 현재 보유수량으로 자동 계산한 값입니다. 기업이 배당을 바꾸면 달라질 수 있는 추정치이고,
          "실제로 받은 배당"은 아래 표에 직접 기록해야 정확히 남습니다.
        </p>

        {autoDividendRows.length === 0 ? (
          <p className="empty-hint">
            {dividendInfoLoading ? '조회 중이에요…' : '배당 데이터를 찾은 보유 종목이 없어요 (무배당 종목이거나 조회에 실패했을 수 있어요).'}
          </p>
        ) : (
          <>
            {canCombineAuto && autoDividendCombinedKrw != null && (
              <div className="summary-cards" style={{ marginBottom: 12 }}>
                <div className="summary-card highlight">
                  <span className="label">전체 합산(원화 환산) 예상 연간 배당금 (세전)</span>
                  <span className="value">{formatMoney(autoDividendCombinedKrw, 'KRW')}</span>
                </div>
                <div className="summary-card">
                  <span className="label">세후 환산</span>
                  <span className="value">{formatMoney(calculateDividendTax(autoDividendCombinedKrw).netDividend, 'KRW')}</span>
                </div>
              </div>
            )}

            {autoDividendCurrencies.map((currency) => (
              <div key={currency} className="summary-cards" style={{ marginBottom: 12 }}>
                <div className="summary-card highlight">
                  <span className="label">{currency} 예상 연간 배당금 (세전)</span>
                  <span className="value">{formatMoney(autoDividendTotalsByCurrency[currency], currency)}</span>
                </div>
                <div className="summary-card">
                  <span className="label">{currency} 세후 환산</span>
                  <span className="value">
                    {formatMoney(calculateDividendTax(autoDividendTotalsByCurrency[currency]).netDividend, currency)}
                  </span>
                </div>
              </div>
            ))}

            <table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>보유수량</th>
                  <th>최근 결산 주당배당금</th>
                  <th>배당수익률</th>
                  <th>예상 연간 배당금 (세전)</th>
                </tr>
              </thead>
              <tbody>
                {autoDividendRows.map((r) => (
                  <tr key={r.holding.id}>
                    <td>
                      {r.holding.name} <span className="muted">({r.holding.ticker})</span>
                    </td>
                    <td>{formatQuantity(r.position.quantity)}</td>
                    <td>
                      {r.info.dividendPerShare != null ? formatMoney(r.info.dividendPerShare, r.holding.currency) : '—'}
                    </td>
                    <td>{r.info.dividendYieldPercent != null ? `${r.info.dividendYieldPercent.toFixed(2)}%` : '—'}</td>
                    <td>{formatMoney(r.expectedAnnualDividend, r.holding.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {canCombine && combinedTotalsKrw && (
        <div className="summary-cards" style={{ marginBottom: 12 }}>
          <div className="summary-card">
            <span className="label">전체 합산(원화 환산) 올해 배당금 (세전)</span>
            <span className="value">{formatMoney(combinedTotalsKrw.ytdGross, 'KRW')}</span>
          </div>
          <div className="summary-card highlight">
            <span className="label">전체 합산(원화 환산) 올해 배당금 (세후)</span>
            <span className="value">{formatMoney(combinedTotalsKrw.ytdNet, 'KRW')}</span>
          </div>
          <div className="summary-card">
            <span className="label">전체 합산(원화 환산) 누적 배당금 (세전)</span>
            <span className="value">{formatMoney(combinedTotalsKrw.allTimeGross, 'KRW')}</span>
          </div>
          <div className="summary-card">
            <span className="label">전체 합산(원화 환산) 누적 배당금 (세후)</span>
            <span className="value">{formatMoney(combinedTotalsKrw.allTimeNet, 'KRW')}</span>
          </div>
        </div>
      )}

      {currenciesWithDividends.map((currency) => {
        const t = totalsByCurrency[currency]
        return (
          <div key={currency} className="summary-cards" style={{ marginBottom: 24 }}>
            <div className="summary-card">
              <span className="label">{currency} 올해 배당금 (세전)</span>
              <span className="value">{formatMoney(t.ytdGross, currency)}</span>
            </div>
            <div className="summary-card highlight">
              <span className="label">{currency} 올해 배당금 (세후)</span>
              <span className="value">{formatMoney(t.ytdNet, currency)}</span>
            </div>
            <div className="summary-card">
              <span className="label">{currency} 누적 배당금 (세전)</span>
              <span className="value">{formatMoney(t.allTimeGross, currency)}</span>
            </div>
            <div className="summary-card">
              <span className="label">{currency} 누적 배당금 (세후)</span>
              <span className="value">{formatMoney(t.allTimeNet, currency)}</span>
            </div>
          </div>
        )
      })}

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          종목
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
          지급일
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label>
          세전 수령액
          <input
            type="number"
            min="0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="예: 45000"
          />
        </label>
        <label>
          메모 (선택)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="분기배당 등" />
        </label>
        <button type="submit" className="primary" disabled={holdings.length === 0}>
          배당 기록 추가
        </button>
      </form>

      {records.length === 0 ? (
        <p className="empty-hint">아직 등록된 배당 기록이 없습니다.</p>
      ) : (
        <table style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>지급일</th>
              <th>종목</th>
              <th>세전 수령액</th>
              <th>메모</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...records]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{holdingName(r.holdingId)}</td>
                  <td>{formatMoney(r.amount, holdingCurrency(r.holdingId))}</td>
                  <td className="muted">{r.note ?? '—'}</td>
                  <td>
                    <button className="link-danger" onClick={() => handleDelete(r.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>기간별 배당 수익</h2>
        {records.length === 0 ? (
          <p className="empty-hint">기록된 배당이 없어서 기간별 집계를 보여드릴 게 없어요.</p>
        ) : (
          <>
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
            {currenciesWithDividends.map((currency) => {
              const buckets = periodBucketsByCurrency[currency]
              return (
                <div key={currency} style={{ marginBottom: 16 }}>
                  {currenciesWithDividends.length > 1 && <p className="muted small">{currency}</p>}
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={buckets}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v) => formatAxisTick(v, currency)} />
                        <Tooltip formatter={(v: number) => formatMoney(v, currency)} />
                        <Bar dataKey="total" name="배당 수익" fill="#3182F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })}
            <p className="muted small">
              최근 {MAX_BUCKETS_SHOWN}개 구간만 표시합니다(세전 기준).
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>기대 배당금 시뮬레이션</h2>
        {dividendPlans.length === 0 ? (
          <p className="empty-hint">
            '적립식 계획 &amp; 시뮬레이션'에서 계획을 만들 때 가정 배당수익률을 입력한 종목이 있어야 시뮬레이션할 수
            있어요.
          </p>
        ) : (
          <>
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
                전체 적립액 배율: {amountMultiplierPercent}%
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

            {canCombine && combinedDividendProjectionKrw && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14 }}>전체 합산 (원화 환산, 추정)</h3>
                <div className="summary-cards">
                  <div className="summary-card highlight">
                    <span className="label">
                      {monthsHorizon}개월 후 예상 연간 배당금 (세전, 원화 환산)
                    </span>
                    <span className="value">
                      {formatMoney(
                        combinedDividendProjectionKrw[combinedDividendProjectionKrw.length - 1]
                          ?.expectedAnnualDividend ?? 0,
                        'KRW'
                      )}
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={combinedDividendProjectionKrw}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                      <YAxis tickFormatter={(v) => formatAxisTick(v, 'KRW')} />
                      <Tooltip formatter={(v: number) => formatMoney(v, 'KRW')} labelFormatter={(m) => `${m}개월차`} />
                      <Line
                        type="monotone"
                        dataKey="expectedAnnualDividend"
                        name="예상 연간 배당금 (원화 환산)"
                        stroke="#3182F6"
                        dot={false}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {currenciesWithDividendPlans.map((currency) => {
              const projection = dividendProjectionByCurrency[currency]
              const expectedAtHorizon = projection[projection.length - 1]?.expectedAnnualDividend ?? 0
              return (
                <div key={currency} style={{ marginBottom: 20 }}>
                  {currenciesWithDividendPlans.length > 1 && <h3 style={{ fontSize: 14 }}>{currency}</h3>}
                  <div className="summary-cards">
                    <div className="summary-card highlight">
                      <span className="label">{monthsHorizon}개월 후 예상 연간 배당금 (세전)</span>
                      <span className="value">{formatMoney(expectedAtHorizon, currency)}</span>
                    </div>
                    <div className="summary-card">
                      <span className="label">세후 환산</span>
                      <span className="value">
                        {formatMoney(calculateDividendTax(expectedAtHorizon).netDividend, currency)}
                      </span>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={projection}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                        <YAxis tickFormatter={(v) => formatAxisTick(v, currency)} />
                        <Tooltip
                          formatter={(v: number) => formatMoney(v, currency)}
                          labelFormatter={(m) => `${m}개월차`}
                        />
                        <Line
                          type="monotone"
                          dataKey="expectedAnnualDividend"
                          name="예상 연간 배당금"
                          stroke="#3182F6"
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })}
            <p className="muted small">
              가정 배당수익률(현재 평가금액 기준)을 적립식 계획에서 입력한 종목만 반영됩니다. 실제 배당은 기업 정책에
              따라 달라질 수 있는 추정치입니다.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
