import { describe, expect, it } from 'vitest'
import { aggregateProjections, projectContributionGrowth, summarizeExpectedReturn } from './compound'

describe('projectContributionGrowth', () => {
  it('0% 수익률이면 평가금액은 납입원금과 정확히 같다', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 1_000_000,
      monthlyContribution: 300_000,
      annualReturnRatePercent: 0,
      months: 12
    })
    const last = points[points.length - 1]
    expect(last.contributed).toBe(1_000_000 + 300_000 * 12)
    expect(last.value).toBeCloseTo(last.contributed, 6)
  })

  it('적립 없이 연 12%(월 1%) 복리로 1년 굴리면 손계산값과 일치한다', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 1_000_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 12,
      months: 12
    })
    const last = points[points.length - 1]
    const expected = 1_000_000 * Math.pow(1.01, 12)
    expect(last.value).toBeCloseTo(expected, 4)
  })

  it('month 배열 길이는 months+1 (0개월 시점 포함)', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 0,
      monthlyContribution: 100_000,
      annualReturnRatePercent: 5,
      months: 6
    })
    expect(points).toHaveLength(7)
    expect(points[0].month).toBe(0)
    expect(points[6].month).toBe(6)
  })
})

describe('aggregateProjections', () => {
  it('빈 배열이면 빈 결과를 반환한다', () => {
    expect(aggregateProjections([])).toEqual([])
  })

  it('종목별로 다른 수익률이어도 월별로 정확히 더한다 (평균이 아니라 합산)', () => {
    const a = projectContributionGrowth({
      initialPrincipal: 1_000_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 0,
      months: 3
    })
    const b = projectContributionGrowth({
      initialPrincipal: 2_000_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 12,
      months: 3
    })
    const combined = aggregateProjections([a, b])

    expect(combined).toHaveLength(4)
    for (let m = 0; m <= 3; m++) {
      expect(combined[m].contributed).toBeCloseTo(a[m].contributed + b[m].contributed, 6)
      expect(combined[m].value).toBeCloseTo(a[m].value + b[m].value, 6)
    }
    // 단순 평균이 아님을 확인 (0%와 12%의 평균인 6%로 계산했다면 다른 값이 나와야 함)
    const naiveAverageValue = 3_000_000 * Math.pow(1 + 0.06 / 12, 3)
    expect(combined[3].value).not.toBeCloseTo(naiveAverageValue, 2)
  })
})

describe('summarizeExpectedReturn', () => {
  it('기대수익 = 최종 평가금액 - 총 납입원금', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 0,
      monthlyContribution: 500_000,
      annualReturnRatePercent: 8,
      months: 24
    })
    const summary = summarizeExpectedReturn(points)
    const last = points[points.length - 1]
    expect(summary.finalValue).toBe(last.value)
    expect(summary.totalContributed).toBe(last.contributed)
    expect(summary.expectedProfit).toBeCloseTo(last.value - last.contributed, 6)
  })
})
