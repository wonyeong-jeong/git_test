import { describe, expect, it } from 'vitest'
import {
  computeMonthlyInvestable,
  evaluateGoalFeasibility,
  monthsUntil,
  requiredMonthlyContribution
} from './financialGoal'
import { projectContributionGrowth } from './compound'

describe('requiredMonthlyContribution', () => {
  it('0% 수익률이면 (목표 - 원금) / 개월수와 정확히 같다(복리 없이 단순 나눗셈)', () => {
    const required = requiredMonthlyContribution(100_000_000, 220_000_000, 12, 0)
    expect(required).toBeCloseTo((220_000_000 - 100_000_000) / 12, 4)
  })

  it('역산한 월 투자액을 실제로 넣어보면 목표 금액에 정확히 도달한다(왕복 검증)', () => {
    const currentNetWorth = 50_000_000
    const targetAmount = 2_000_000_000
    const months = 204 // 17년
    const rate = 7
    const required = requiredMonthlyContribution(currentNetWorth, targetAmount, months, rate)

    const points = projectContributionGrowth({
      initialPrincipal: currentNetWorth,
      monthlyContribution: required,
      annualReturnRatePercent: rate,
      months
    })
    expect(points[points.length - 1].value).toBeCloseTo(targetAmount, 0)
  })

  it('이미 원금만으로 목표를 넘어섰으면 0을 반환한다(추가로 넣을 필요 없음)', () => {
    expect(requiredMonthlyContribution(3_000_000_000, 2_000_000_000, 120, 5)).toBe(0)
  })

  it('개월수가 0인데 원금이 목표에 못 미치면 Infinity(그 안에는 절대 불가능)', () => {
    expect(requiredMonthlyContribution(100, 1_000_000, 0, 5)).toBe(Infinity)
  })
})

describe('evaluateGoalFeasibility', () => {
  it('지금 페이스로 목표를 넘어서면 isAchievable true, shortfall 0', () => {
    const result = evaluateGoalFeasibility({
      currentNetWorth: 100_000_000,
      monthlyInvestable: 5_000_000,
      months: 120,
      assumedAnnualReturnRatePercent: 8,
      targetAmount: 500_000_000
    })
    expect(result.isAchievable).toBe(true)
    expect(result.shortfall).toBe(0)
    expect(result.projectedValue).toBeGreaterThan(500_000_000)
  })

  it('지금 페이스로 목표에 못 미치면 isAchievable false이고 shortfall이 양수', () => {
    const result = evaluateGoalFeasibility({
      currentNetWorth: 10_000_000,
      monthlyInvestable: 500_000,
      months: 60,
      assumedAnnualReturnRatePercent: 5,
      targetAmount: 2_000_000_000
    })
    expect(result.isAchievable).toBe(false)
    expect(result.shortfall).toBeCloseTo(2_000_000_000 - result.projectedValue, 4)
    expect(result.requiredMonthlyContribution).toBeGreaterThan(500_000)
  })
})

describe('monthsUntil', () => {
  it('정확히 1년 뒤 날짜면 12개월로 계산한다', () => {
    expect(monthsUntil('2027-08-17', '2026-08-17')).toBe(12)
  })

  it('이미 지난 날짜면 0을 반환한다(음수 개월 방지)', () => {
    expect(monthsUntil('2020-01-01', '2026-08-17')).toBe(0)
  })

  it('28세→45세(17년)처럼 오랜 기간도 정확히 개월 수로 환산한다', () => {
    const months = monthsUntil('2043-08-17', '2026-08-17')
    expect(months).toBeCloseTo(17 * 12, 0)
  })
})

describe('computeMonthlyInvestable', () => {
  it('월급에서 적금 납입액과 대출 상환액을 뺀다', () => {
    expect(
      computeMonthlyInvestable({
        totalMonthlyIncome: 4_000_000,
        totalMonthlySavingsContribution: 500_000,
        totalMonthlyLoanPayment: 800_000
      })
    ).toBe(2_700_000)
  })

  it('지출이 소득보다 많으면 음수가 될 수 있다(투자 여력이 없다는 신호)', () => {
    expect(
      computeMonthlyInvestable({
        totalMonthlyIncome: 2_000_000,
        totalMonthlySavingsContribution: 500_000,
        totalMonthlyLoanPayment: 2_000_000
      })
    ).toBe(-500_000)
  })
})
