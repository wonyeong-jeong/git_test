import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FinancialGoal, Holding, IncomeSource, Loan, ManualPurchase, SavingsAccount } from '../../types'
import { evaluateGoalFeasibility, monthsUntil } from '../../domain/financialGoal'
import { deriveCurrentPosition } from '../../domain/position'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFxRates } from '../../hooks/useFxRates'
import { formatAxisTick, formatMoney } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
}

const emptyIncomeForm = { name: '본급여', monthlyAmount: '', currency: 'KRW' as 'KRW' | 'USD' }
const emptySavingsForm = { name: '', currentBalance: '', monthlyContribution: '0', interestRatePercent: '0', currency: 'KRW' as 'KRW' | 'USD' }
const emptyLoanForm = { name: '', remainingBalance: '', monthlyPayment: '', interestRatePercent: '0', currency: 'KRW' as 'KRW' | 'USD' }
const emptyGoalForm = {
  name: '',
  targetAmount: '',
  currency: 'KRW' as 'KRW' | 'USD',
  currentAge: '',
  targetAge: '',
  targetDate: '',
  assumedAnnualReturnRatePercent: '7'
}

/** 나이 두 개(현재/목표)를 입력하면 targetDate를 대신 계산해준다 — 이 앱은 생년월일을 따로
 * 저장하지 않으므로, "오늘부터 몇 년 뒤"로 환산해서 날짜 하나만 저장한다. */
function targetDateFromAges(currentAge: string, targetAge: string): string | null {
  const cur = Number(currentAge)
  const tgt = Number(targetAge)
  if (!Number.isFinite(cur) || !Number.isFinite(tgt) || tgt <= cur) return null
  const yearsLeft = tgt - cur
  const d = new Date()
  d.setFullYear(d.getFullYear() + yearsLeft)
  return d.toISOString().slice(0, 10)
}

export default function GoalsPage({ profileId, holdings }: Props): JSX.Element {
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([])
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])

  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm)
  const [savingsForm, setSavingsForm] = useState(emptySavingsForm)
  const [loanForm, setLoanForm] = useState(emptyLoanForm)
  const [goalForm, setGoalForm] = useState(emptyGoalForm)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [returnOverride, setReturnOverride] = useState<number | null>(null)
  const [monthlyInvestableOverride, setMonthlyInvestableOverride] = useState<number | null>(null)

  const { usdKrw } = useFxRates()

  async function refreshAll(): Promise<void> {
    const [income, savings, loanList, goalList, purchaseList] = await Promise.all([
      window.api.incomeSources.list(profileId),
      window.api.savingsAccounts.list(profileId),
      window.api.loans.list(profileId),
      window.api.financialGoals.list(profileId),
      window.api.manualPurchases.list(profileId)
    ])
    setIncomeSources(income)
    setSavingsAccounts(savings)
    setLoans(loanList)
    setGoals(goalList)
    setPurchases(purchaseList)
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  // 순자산 계산에 지금 평가금액이 필요해서 시세를 한 번 조회한다 — 보유종목 페이지처럼 계속
  // 폴링하지는 않고, 이 화면을 열 때 한 번만.
  const watched = useMemo(() => holdings.map((h) => ({ ticker: h.ticker, currency: h.currency })), [holdings])
  const { quotes, refreshNow } = useAutoRefreshQuotes(watched)
  useEffect(() => {
    if (holdings.length > 0) refreshNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.length])

  function fx(currency: string): number {
    return currency === 'USD' ? (usdKrw ?? 0) : 1
  }
  const fxReady = usdKrw != null || ![...holdings.map((h) => h.currency), ...incomeSources.map((i) => i.currency)].includes('USD')

  const stockValueKrw = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const position = deriveCurrentPosition(
        h,
        purchases.filter((p) => p.holdingId === h.id)
      )
      const quote = quotes[h.ticker]
      const price = quote && quote.currency === h.currency ? quote.lastPrice : position.avgPrice
      return sum + position.quantity * price * fx(h.currency)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, purchases, quotes, usdKrw])

  const savingsTotalKrw = useMemo(
    () => savingsAccounts.reduce((sum, s) => sum + s.currentBalance * fx(s.currency), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savingsAccounts, usdKrw]
  )
  const loansTotalKrw = useMemo(
    () => loans.reduce((sum, l) => sum + l.remainingBalance * fx(l.currency), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loans, usdKrw]
  )
  const netWorthKrw = stockValueKrw + savingsTotalKrw - loansTotalKrw

  const monthlyIncomeKrw = useMemo(
    () => incomeSources.reduce((sum, i) => sum + i.monthlyAmount * fx(i.currency), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomeSources, usdKrw]
  )
  const monthlySavingsContributionKrw = useMemo(
    () => savingsAccounts.reduce((sum, s) => sum + s.monthlyContribution * fx(s.currency), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savingsAccounts, usdKrw]
  )
  const monthlyLoanPaymentKrw = useMemo(
    () => loans.reduce((sum, l) => sum + l.monthlyPayment * fx(l.currency), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loans, usdKrw]
  )
  const monthlyInvestableKrw = monthlyIncomeKrw - monthlySavingsContributionKrw - monthlyLoanPaymentKrw

  async function handleIncomeSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!incomeForm.name || !incomeForm.monthlyAmount) return
    await window.api.incomeSources.create(profileId, {
      name: incomeForm.name,
      monthlyAmount: Number(incomeForm.monthlyAmount),
      currency: incomeForm.currency
    })
    setIncomeForm(emptyIncomeForm)
    refreshAll()
  }

  async function handleSavingsSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!savingsForm.name || !savingsForm.currentBalance) return
    await window.api.savingsAccounts.create(profileId, {
      name: savingsForm.name,
      currentBalance: Number(savingsForm.currentBalance),
      monthlyContribution: Number(savingsForm.monthlyContribution),
      interestRatePercent: Number(savingsForm.interestRatePercent),
      currency: savingsForm.currency
    })
    setSavingsForm(emptySavingsForm)
    refreshAll()
  }

  async function handleLoanSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!loanForm.name || !loanForm.remainingBalance) return
    await window.api.loans.create(profileId, {
      name: loanForm.name,
      remainingBalance: Number(loanForm.remainingBalance),
      monthlyPayment: Number(loanForm.monthlyPayment || '0'),
      interestRatePercent: Number(loanForm.interestRatePercent),
      currency: loanForm.currency
    })
    setLoanForm(emptyLoanForm)
    refreshAll()
  }

  const goalFormTargetDate = goalForm.targetDate || targetDateFromAges(goalForm.currentAge, goalForm.targetAge) || ''

  async function handleGoalSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!goalForm.name || !goalForm.targetAmount || !goalFormTargetDate) return
    await window.api.financialGoals.create(profileId, {
      name: goalForm.name,
      targetAmount: Number(goalForm.targetAmount),
      currency: goalForm.currency,
      targetDate: goalFormTargetDate,
      assumedAnnualReturnRatePercent: Number(goalForm.assumedAnnualReturnRatePercent)
    })
    setGoalForm(emptyGoalForm)
    refreshAll()
  }

  async function handleDelete(kind: 'income' | 'savings' | 'loan' | 'goal', id: string): Promise<void> {
    if (kind === 'income') await window.api.incomeSources.delete(profileId, id)
    if (kind === 'savings') await window.api.savingsAccounts.delete(profileId, id)
    if (kind === 'loan') await window.api.loans.delete(profileId, id)
    if (kind === 'goal') {
      await window.api.financialGoals.delete(profileId, id)
      if (selectedGoalId === id) setSelectedGoalId(null)
    }
    refreshAll()
  }

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null

  // 목표 통화가 USD면 순자산/월투자가능액(원화 기준으로 계산해둠)을 다시 달러로 환산한다.
  const netWorthInGoalCurrency = selectedGoal && selectedGoal.currency === 'USD' && usdKrw ? netWorthKrw / usdKrw : netWorthKrw
  const monthlyInvestableInGoalCurrency =
    selectedGoal && selectedGoal.currency === 'USD' && usdKrw ? monthlyInvestableKrw / usdKrw : monthlyInvestableKrw

  const feasibility = useMemo(() => {
    if (!selectedGoal) return null
    const months = monthsUntil(selectedGoal.targetDate, new Date().toISOString().slice(0, 10))
    const rate = returnOverride ?? selectedGoal.assumedAnnualReturnRatePercent
    const monthlyInvestable = monthlyInvestableOverride ?? monthlyInvestableInGoalCurrency
    return {
      months,
      rate,
      monthlyInvestable,
      result: evaluateGoalFeasibility({
        currentNetWorth: netWorthInGoalCurrency,
        monthlyInvestable,
        months,
        assumedAnnualReturnRatePercent: rate,
        targetAmount: selectedGoal.targetAmount
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGoal, returnOverride, monthlyInvestableOverride, netWorthInGoalCurrency, monthlyInvestableInGoalCurrency])

  return (
    <div>
      <div className="page-header">
        <h1>재무 정보 &amp; 목표</h1>
      </div>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 20 }}>
        월급·적금·대출 같은 주식 외 자산/부채를 등록하면, 목표(예: "45세 전 20억")를 지금 투자
        능력으로 현실적으로 달성할 수 있는지 계산해볼 수 있습니다. 통화가 섞여 있으면 실시간
        환율로 원화(또는 목표 통화) 기준으로 환산한 추정치입니다.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>순자산 요약</h2>
        <div className="summary-cards">
          <div className="summary-card">
            <span className="label">주식 평가금액</span>
            <span className="value">{formatMoney(stockValueKrw, 'KRW')}</span>
          </div>
          <div className="summary-card">
            <span className="label">예적금 잔액</span>
            <span className="value">{formatMoney(savingsTotalKrw, 'KRW')}</span>
          </div>
          <div className="summary-card">
            <span className="label">대출 잔액</span>
            <span className="value">-{formatMoney(loansTotalKrw, 'KRW')}</span>
          </div>
          <div className="summary-card highlight">
            <span className="label">순자산</span>
            <span className="value">{formatMoney(netWorthKrw, 'KRW')}</span>
          </div>
          <div className="summary-card">
            <span className="label">월 투자 가능액</span>
            <span className="value">{formatMoney(monthlyInvestableKrw, 'KRW')}</span>
          </div>
        </div>
        {!fxReady && <p className="muted small" style={{ marginBottom: 0 }}>환율을 불러오는 중이라 일부 값이 부정확할 수 있어요…</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>
          월 투자 가능액 = 월급 등 소득 − 적금 납입액 − 대출 상환액. 실제 생활비 등 다른 지출은
          반영되지 않으니 참고용으로 봐주세요.
        </p>
      </div>

      <div className="home-columns">
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>월급 등 소득</h2>
          <form className="form-grid" onSubmit={handleIncomeSubmit} style={{ marginBottom: 16 }}>
            <label>
              이름
              <input value={incomeForm.name} onChange={(e) => setIncomeForm({ ...incomeForm, name: e.target.value })} />
            </label>
            <label>
              월 금액
              <input
                type="number"
                min="0"
                value={incomeForm.monthlyAmount}
                onChange={(e) => setIncomeForm({ ...incomeForm, monthlyAmount: e.target.value })}
                placeholder="예: 4000000"
              />
            </label>
            <label>
              통화
              <select value={incomeForm.currency} onChange={(e) => setIncomeForm({ ...incomeForm, currency: e.target.value as 'KRW' | 'USD' })}>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <button type="submit" className="primary">추가</button>
          </form>
          {incomeSources.length === 0 ? (
            <p className="empty-hint" style={{ marginBottom: 0 }}>등록된 소득이 없어요.</p>
          ) : (
            <ul className="upcoming-list">
              {incomeSources.map((i) => (
                <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{i.name} — {formatMoney(i.monthlyAmount, i.currency)}/월</span>
                  <button className="link-danger" onClick={() => handleDelete('income', i.id)}>삭제</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>적금/예금</h2>
          <form className="form-grid" onSubmit={handleSavingsSubmit} style={{ marginBottom: 16 }}>
            <label>
              이름
              <input value={savingsForm.name} onChange={(e) => setSavingsForm({ ...savingsForm, name: e.target.value })} placeholder="예: 정기적금" />
            </label>
            <label>
              현재 잔액
              <input
                type="number"
                min="0"
                value={savingsForm.currentBalance}
                onChange={(e) => setSavingsForm({ ...savingsForm, currentBalance: e.target.value })}
              />
            </label>
            <label>
              월 납입액
              <input
                type="number"
                min="0"
                value={savingsForm.monthlyContribution}
                onChange={(e) => setSavingsForm({ ...savingsForm, monthlyContribution: e.target.value })}
              />
            </label>
            <label>
              이자율(%)
              <input
                type="number"
                step="0.1"
                value={savingsForm.interestRatePercent}
                onChange={(e) => setSavingsForm({ ...savingsForm, interestRatePercent: e.target.value })}
              />
            </label>
            <label>
              통화
              <select value={savingsForm.currency} onChange={(e) => setSavingsForm({ ...savingsForm, currency: e.target.value as 'KRW' | 'USD' })}>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <button type="submit" className="primary">추가</button>
          </form>
          {savingsAccounts.length === 0 ? (
            <p className="empty-hint" style={{ marginBottom: 0 }}>등록된 적금/예금이 없어요.</p>
          ) : (
            <ul className="upcoming-list">
              {savingsAccounts.map((s) => (
                <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {s.name} — {formatMoney(s.currentBalance, s.currency)} (월 {formatMoney(s.monthlyContribution, s.currency)} 납입, {s.interestRatePercent}%)
                  </span>
                  <button className="link-danger" onClick={() => handleDelete('savings', s.id)}>삭제</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>대출</h2>
          <form className="form-grid" onSubmit={handleLoanSubmit} style={{ marginBottom: 16 }}>
            <label>
              이름
              <input value={loanForm.name} onChange={(e) => setLoanForm({ ...loanForm, name: e.target.value })} placeholder="예: 전세자금대출" />
            </label>
            <label>
              남은 잔액
              <input
                type="number"
                min="0"
                value={loanForm.remainingBalance}
                onChange={(e) => setLoanForm({ ...loanForm, remainingBalance: e.target.value })}
              />
            </label>
            <label>
              월 상환액
              <input
                type="number"
                min="0"
                value={loanForm.monthlyPayment}
                onChange={(e) => setLoanForm({ ...loanForm, monthlyPayment: e.target.value })}
              />
            </label>
            <label>
              금리(%)
              <input
                type="number"
                step="0.1"
                value={loanForm.interestRatePercent}
                onChange={(e) => setLoanForm({ ...loanForm, interestRatePercent: e.target.value })}
              />
            </label>
            <label>
              통화
              <select value={loanForm.currency} onChange={(e) => setLoanForm({ ...loanForm, currency: e.target.value as 'KRW' | 'USD' })}>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <button type="submit" className="primary">추가</button>
          </form>
          {loans.length === 0 ? (
            <p className="empty-hint" style={{ marginBottom: 0 }}>등록된 대출이 없어요.</p>
          ) : (
            <ul className="upcoming-list">
              {loans.map((l) => (
                <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {l.name} — 잔액 {formatMoney(l.remainingBalance, l.currency)} (월 {formatMoney(l.monthlyPayment, l.currency)} 상환, {l.interestRatePercent}%)
                  </span>
                  <button className="link-danger" onClick={() => handleDelete('loan', l.id)}>삭제</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="page-header" style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 18 }}>목표 설정 &amp; 현실 가능성 평가</h1>
      </div>

      <form className="card form-grid" onSubmit={handleGoalSubmit}>
        <label>
          목표 이름
          <input value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="예: 45세 전 20억 모으기" />
        </label>
        <label>
          목표 금액
          <input
            type="number"
            min="0"
            value={goalForm.targetAmount}
            onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })}
            placeholder="예: 2000000000"
          />
        </label>
        <label>
          통화
          <select value={goalForm.currency} onChange={(e) => setGoalForm({ ...goalForm, currency: e.target.value as 'KRW' | 'USD' })}>
            <option value="KRW">KRW</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          현재 나이
          <input
            type="number"
            min="0"
            value={goalForm.currentAge}
            onChange={(e) => setGoalForm({ ...goalForm, currentAge: e.target.value, targetDate: '' })}
            placeholder="예: 28"
          />
        </label>
        <label>
          목표 나이
          <input
            type="number"
            min="0"
            value={goalForm.targetAge}
            onChange={(e) => setGoalForm({ ...goalForm, targetAge: e.target.value, targetDate: '' })}
            placeholder="예: 45"
          />
        </label>
        <label>
          또는 목표 날짜 직접 지정
          <input
            type="date"
            value={goalFormTargetDate}
            onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })}
          />
        </label>
        <label>
          가정 연 수익률(%)
          <input
            type="number"
            step="0.1"
            value={goalForm.assumedAnnualReturnRatePercent}
            onChange={(e) => setGoalForm({ ...goalForm, assumedAnnualReturnRatePercent: e.target.value })}
          />
        </label>
        <button type="submit" className="primary">목표 추가</button>
      </form>

      <div className="plan-layout">
        <section className="plan-list">
          {goals.map((g) => (
            <button
              key={g.id}
              className={`plan-card ${selectedGoalId === g.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedGoalId(g.id)
                setReturnOverride(null)
                setMonthlyInvestableOverride(null)
              }}
            >
              <strong>{g.name}</strong>
              <span className="muted">
                {formatMoney(g.targetAmount, g.currency)} · {g.targetDate}까지
              </span>
              <span className="link-danger" onClick={(e) => { e.stopPropagation(); handleDelete('goal', g.id) }}>
                삭제
              </span>
            </button>
          ))}
          {goals.length === 0 && <p className="empty-hint">등록된 목표가 없습니다.</p>}
        </section>

        {selectedGoal && feasibility && (
          <section className="card simulation-panel">
            <h2>{selectedGoal.name}</h2>
            <p className="muted small" style={{ marginTop: -4 }}>
              목표일까지 {feasibility.months}개월 남았습니다({selectedGoal.targetDate} 기준). 아래 값은 등록된 재무
              정보(순자산·월 투자 가능액)를 자동으로 반영한 시뮬레이션입니다.
            </p>

            <div className="sim-controls">
              <label>
                가정 연 수익률: {feasibility.rate.toFixed(1)}%
                <input
                  type="range"
                  min={-10}
                  max={30}
                  step={0.5}
                  value={feasibility.rate}
                  onChange={(e) => setReturnOverride(Number(e.target.value))}
                />
              </label>
              <label>
                월 투자 가능액: {formatMoney(feasibility.monthlyInvestable, selectedGoal.currency)}
                <input
                  type="range"
                  min={0}
                  max={Math.max(feasibility.monthlyInvestable * 3, 1_000_000)}
                  step={10000}
                  value={Math.max(feasibility.monthlyInvestable, 0)}
                  onChange={(e) => setMonthlyInvestableOverride(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="summary-cards">
              <div className={`summary-card ${feasibility.result.isAchievable ? 'highlight' : ''}`}>
                <span className="label">이 페이스로 예상 도달 금액</span>
                <span className="value">{formatMoney(feasibility.result.projectedValue, selectedGoal.currency)}</span>
              </div>
              <div className="summary-card">
                <span className="label">달성 가능 여부</span>
                <span className={`value ${feasibility.result.isAchievable ? 'num-positive' : 'num-negative'}`}>
                  {feasibility.result.isAchievable ? '달성 가능' : '부족'}
                </span>
              </div>
              {!feasibility.result.isAchievable && (
                <div className="summary-card">
                  <span className="label">부족액</span>
                  <span className="value num-negative">{formatMoney(feasibility.result.shortfall, selectedGoal.currency)}</span>
                </div>
              )}
              <div className="summary-card">
                <span className="label">목표를 정확히 맞추려면 필요한 월 투자액</span>
                <span className="value">
                  {Number.isFinite(feasibility.result.requiredMonthlyContribution)
                    ? formatMoney(feasibility.result.requiredMonthlyContribution, selectedGoal.currency)
                    : '이 기간·수익률로는 불가능'}
                </span>
              </div>
            </div>

            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={feasibility.result.points}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" label={{ value: '개월', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tickFormatter={(v) => formatAxisTick(v, selectedGoal.currency)} />
                  <Tooltip formatter={(v: number) => formatMoney(v, selectedGoal.currency)} labelFormatter={(m) => `${m}개월차`} />
                  <Legend />
                  <Line type="monotone" dataKey="contributed" name="누적 투자원금" stroke="#ADB5BD" dot={false} />
                  <Line type="monotone" dataKey="value" name="예상 평가금액" stroke="#3182F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              가정 연 수익률이 계속 유지된다는 단순화된 시뮬레이션입니다. 실제 시장은 매년 등락이 있고, 생활비 등
              반영 안 된 지출이 있을 수 있어 참고용으로만 봐주세요.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
