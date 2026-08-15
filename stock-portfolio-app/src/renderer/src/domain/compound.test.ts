import { describe, expect, it } from 'vitest'
import {
  aggregateProjections,
  projectContributionGrowth,
  projectPlanContributionGrowth,
  projectQuantityContributionGrowth,
  summarizeExpectedReturn
} from './compound'

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

describe('projectQuantityContributionGrowth', () => {
  it('0% 수익률이면 회당 투입금액이 매달 동일해서 금액 기준 적립과 결과가 같다', () => {
    const points = projectQuantityContributionGrowth({
      initialPrincipal: 0,
      quantityPerContribution: 2,
      referencePrice: 50_000,
      annualReturnRatePercent: 0,
      months: 12
    })
    const last = points[points.length - 1]
    expect(last.contributed).toBeCloseTo(2 * 50_000 * 12, 6)
    expect(last.value).toBeCloseTo(last.contributed, 6)
  })

  it('수익률이 있으면 매달 기준가도 같이 올라 회당 투입금액이 점점 커진다(손계산과 일치)', () => {
    // 월 1%(연 12%), 매달 1주씩, 기준가 1000원부터 시작
    const points = projectQuantityContributionGrowth({
      initialPrincipal: 0,
      quantityPerContribution: 1,
      referencePrice: 1000,
      annualReturnRatePercent: 12,
      months: 2
    })
    // 1개월차: 기준가 1000 -> 투입 1000 -> 평가금액 (0+1000)*1.01=1010
    expect(points[1].contributed).toBeCloseTo(1000, 6)
    expect(points[1].value).toBeCloseTo(1010, 6)
    // 2개월차: 기준가 1010 -> 투입 1010 -> 누적원금 2010, 평가금액 (1010+1010)*1.01=2040.2
    expect(points[2].contributed).toBeCloseTo(2010, 6)
    expect(points[2].value).toBeCloseTo(2040.2, 6)
  })

  it('금액 고정 적립보다 총 투입원금이 더 크다(주가 상승 가정 시 회당 투입액이 커지므로)', () => {
    const quantityBased = projectQuantityContributionGrowth({
      initialPrincipal: 0,
      quantityPerContribution: 1,
      referencePrice: 1000,
      annualReturnRatePercent: 12,
      months: 12
    })
    const amountBased = projectContributionGrowth({
      initialPrincipal: 0,
      monthlyContribution: 1000, // 수량 기준의 '첫 달' 투입액과 동일한 금액으로 고정
      annualReturnRatePercent: 12,
      months: 12
    })
    const lastQty = quantityBased[quantityBased.length - 1]
    const lastAmt = amountBased[amountBased.length - 1]
    expect(lastQty.contributed).toBeGreaterThan(lastAmt.contributed)
  })
})

describe('projectPlanContributionGrowth', () => {
  it("contributionType이 'AMOUNT'면 projectContributionGrowth와 동일한 결과", () => {
    const viaDispatcher = projectPlanContributionGrowth({
      contributionType: 'AMOUNT',
      value: 300_000,
      initialPrincipal: 1_000_000,
      annualReturnRatePercent: 7,
      months: 12
    })
    const direct = projectContributionGrowth({
      initialPrincipal: 1_000_000,
      monthlyContribution: 300_000,
      annualReturnRatePercent: 7,
      months: 12
    })
    expect(viaDispatcher).toEqual(direct)
  })

  it("contributionType이 'QUANTITY'면 projectQuantityContributionGrowth와 동일한 결과", () => {
    const viaDispatcher = projectPlanContributionGrowth({
      contributionType: 'QUANTITY',
      value: 0.5,
      referencePrice: 80_000,
      initialPrincipal: 500_000,
      annualReturnRatePercent: 7,
      months: 12
    })
    const direct = projectQuantityContributionGrowth({
      initialPrincipal: 500_000,
      quantityPerContribution: 0.5,
      referencePrice: 80_000,
      annualReturnRatePercent: 7,
      months: 12
    })
    expect(viaDispatcher).toEqual(direct)
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
