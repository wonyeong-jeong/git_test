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
import type { ContributionPlan, DividendRecord, Holding } from '../../types'
import { projectPlanContributionGrowth } from '../../domain/compound'
import {
  aggregateDividendProjections,
  groupDividendsByPeriod,
  projectExpectedDividends,
  sumDividendRecords,
  type DividendGranularity
} from '../../domain/dividend'
import { calculateDividendTax } from '../../domain/tax'
import { formatAxisTick, formatMoney } from '../../utils/format'

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
  const [form, setForm] = useState(emptyForm)

  const [monthsHorizon, setMonthsHorizon] = useState(24)
  const [amountMultiplierPercent, setAmountMultiplierPercent] = useState(100)
  const [granularity, setGranularity] = useState<DividendGranularity>('MONTH')

  async function refreshRecords(): Promise<void> {
    setRecords(await window.api.dividends.list(profileId))
  }

  useEffect(() => {
    refreshRecords()
    window.api.contributionPlans.list(profileId).then(setPlans)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

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
          const growth = projectPlanContributionGrowth({
            contributionType: plan.contributionType,
            frequency: plan.frequency,
            value: plan.amount * (amountMultiplierPercent / 100),
            referencePrice: holding.avgPrice,
            initialPrincipal: holding.quantity * holding.avgPrice,
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
  }, [dividendPlans, holdings, monthsHorizon, amountMultiplierPercent, currenciesWithDividendPlans])

  return (
    <div>
      <div className="page-header">
        <h1>배당</h1>
      </div>

      {currenciesWithDividends.length > 1 && (
        <p className="muted small" style={{ marginTop: -8 }}>
          보유 통화가 여러 개라(KRW/USD) 환율 없이 더하지 않고 통화별로 따로 집계해서 보여드립니다.
        </p>
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
