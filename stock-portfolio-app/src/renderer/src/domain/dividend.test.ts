import { describe, expect, it } from 'vitest'
import { projectContributionGrowth } from './compound'
import {
  aggregateDividendProjections,
  groupDividendsByPeriod,
  projectExpectedDividends,
  sumDividendRecords
} from './dividend'

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

describe('groupDividendsByPeriod', () => {
  const records = [
    { date: '2026-01-05', amount: 10_000 }, // 2026-W02
    { date: '2026-01-06', amount: 5_000 }, // 2026-W02 (같은 주)
    { date: '2026-02-10', amount: 20_000 }, // 2026-02
    { date: '2025-12-31', amount: 7_000 } // 2025-12 / 2025-W01
  ]

  it('월별로 합산하고 오래된 순으로 정렬한다', () => {
    const buckets = groupDividendsByPeriod(records, 'MONTH')
    expect(buckets).toEqual([
      { key: '2025-12', label: '2025년 12월', total: 7_000 },
      { key: '2026-01', label: '2026년 1월', total: 15_000 },
      { key: '2026-02', label: '2026년 2월', total: 20_000 }
    ])
  })

  it('연도별로 합산한다', () => {
    const buckets = groupDividendsByPeriod(records, 'YEAR')
    expect(buckets).toEqual([
      { key: '2025', label: '2025년', total: 7_000 },
      { key: '2026', label: '2026년', total: 35_000 }
    ])
  })

  it('ISO 주차별로 합산한다 (같은 주는 하나로 묶임)', () => {
    // 2025-12-31은 1/1(목)이 포함된 주에 속해서 ISO 규칙상 '2026-W01'로 묶인다
    const buckets = groupDividendsByPeriod(records, 'WEEK')
    expect(buckets).toEqual([
      { key: '2026-W01', label: '2026-W01', total: 7_000 },
      { key: '2026-W02', label: '2026-W02', total: 15_000 },
      { key: '2026-W07', label: '2026-W07', total: 20_000 }
    ])
  })

  it('빈 배열이면 빈 결과', () => {
    expect(groupDividendsByPeriod([], 'MONTH')).toEqual([])
  })
})
