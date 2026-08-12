import { describe, expect, it } from 'vitest'
import { projectContributionGrowth } from './compound'
import { aggregateDividendProjections, projectExpectedDividends, sumDividendRecords } from './dividend'

describe('projectExpectedDividends', () => {
  it('평가금액 * 배당수익률로 연간 기대 배당금을 계산한다', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 1_000_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 0,
      months: 3
    })
    const dividends = projectExpectedDividends(points, 4) // 연 4%
    expect(dividends).toHaveLength(4)
    expect(dividends[0].expectedAnnualDividend).toBeCloseTo(40_000, 6) // 1,000,000 * 4%
  })
})

describe('aggregateDividendProjections', () => {
  it('여러 종목의 기대 배당금을 월별로 합산한다', () => {
    const a = projectExpectedDividends(
      projectContributionGrowth({ initialPrincipal: 1_000_000, monthlyContribution: 0, annualReturnRatePercent: 0, months: 2 }),
      2
    )
    const b = projectExpectedDividends(
      projectContributionGrowth({ initialPrincipal: 2_000_000, monthlyContribution: 0, annualReturnRatePercent: 0, months: 2 }),
      3
    )
    const combined = aggregateDividendProjections([a, b])
    // a: 1,000,000*2% = 20,000 / b: 2,000,000*3% = 60,000 -> 합산 80,000
    expect(combined[0].expectedAnnualDividend).toBeCloseTo(80_000, 6)
  })

  it('빈 배열이면 빈 결과', () => {
    expect(aggregateDividendProjections([])).toEqual([])
  })
})

describe('sumDividendRecords', () => {
  it('전체 합산', () => {
    const total = sumDividendRecords([
      { date: '2026-01-15', amount: 10_000 },
      { date: '2026-04-15', amount: 12_000 }
    ])
    expect(total).toBe(22_000)
  })

  it('sinceDate 이후 기록만 합산', () => {
    const total = sumDividendRecords(
      [
        { date: '2025-12-31', amount: 10_000 },
        { date: '2026-01-01', amount: 12_000 }
      ],
      '2026-01-01'
    )
    expect(total).toBe(12_000)
  })
})
