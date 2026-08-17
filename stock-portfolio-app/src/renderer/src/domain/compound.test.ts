import { describe, expect, it } from 'vitest'
import {
  aggregateProjections,
  monthlyEquivalentMultiplier,
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

  it('initialValue를 주면 원금(contributed)과 별개로 평가금액(value)이 그 값에서 시작해서 복리로 이어진다', () => {
    const points = projectContributionGrowth({
      initialPrincipal: 1_000_000, // 실제로 넣은 돈(원가)
      initialValue: 1_200_000, // 지금 실제 시세 기준 평가금액(원가보다 올라 있는 상태)
      monthlyContribution: 0,
      annualReturnRatePercent: 0,
      months: 3
    })
    expect(points[0]).toEqual({ month: 0, contributed: 1_000_000, value: 1_200_000 })
    // 이후로도 원금이 아니라 initialValue에서부터 복리가 이어진다(0% 수익률이라 그대로 유지)
    expect(points[3].value).toBeCloseTo(1_200_000, 6)
    expect(points[3].contributed).toBe(1_000_000)
  })

  it('initialValue를 생략하면 initialPrincipal과 동일하게 시작한다(기존 동작 그대로)', () => {
    const withValue = projectContributionGrowth({
      initialPrincipal: 500_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 5,
      months: 6
    })
    const explicit = projectContributionGrowth({
      initialPrincipal: 500_000,
      initialValue: 500_000,
      monthlyContribution: 0,
      annualReturnRatePercent: 5,
      months: 6
    })
    expect(withValue).toEqual(explicit)
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

describe('monthlyEquivalentMultiplier', () => {
  it('MONTHLY는 1배(그대로)', () => {
    expect(monthlyEquivalentMultiplier('MONTHLY')).toBe(1)
  })

  it('WEEKLY는 4배가 아니라 평균 4.348배(365.2425/7/12)', () => {
    expect(monthlyEquivalentMultiplier('WEEKLY')).toBeCloseTo(4.348, 2)
    expect(monthlyEquivalentMultiplier('WEEKLY')).not.toBeCloseTo(4, 2)
  })
})

describe('projectPlanContributionGrowth', () => {
  it("contributionType이 'AMOUNT'이고 MONTHLY면 projectContributionGrowth와 동일한 결과", () => {
    const viaDispatcher = projectPlanContributionGrowth({
      contributionType: 'AMOUNT',
      frequency: 'MONTHLY',
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

  it("contributionType이 'QUANTITY'이고 MONTHLY면 projectQuantityContributionGrowth와 동일한 결과", () => {
    const viaDispatcher = projectPlanContributionGrowth({
      contributionType: 'QUANTITY',
      frequency: 'MONTHLY',
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

  it('회귀 테스트 — WEEKLY 적립은 월 환산 배수(4.348)를 곱해서 계산한다 (버그: 예전엔 그냥 1번/월로 계산됨)', () => {
    // 매주 1주씩(QLD 같은 시나리오), 기준가 100, 0% 수익률로 12개월 시뮬레이션하면
    // 총 매수 수량은 4.348 * 12 ≈ 52.18주(1년 = 52.18주와 정확히 일치해야 함)여야지,
    // 버그가 있던 것처럼 12주(월 1주)여선 안 된다.
    const weekly = projectPlanContributionGrowth({
      contributionType: 'QUANTITY',
      frequency: 'WEEKLY',
      value: 1,
      referencePrice: 100,
      initialPrincipal: 0,
      annualReturnRatePercent: 0,
      months: 12
    })
    const last = weekly[weekly.length - 1]
    const totalQuantity = last.contributed / 100 // 0% 수익률이라 기준가 불변 -> 금액/기준가 = 수량
    expect(totalQuantity).toBeCloseTo(365.2425 / 7, 2) // 1년치 주 수와 일치
    expect(totalQuantity).not.toBeCloseTo(12, 1) // 버그였다면 이렇게 나왔을 값
  })

  it('같은 회당 값이면 WEEKLY 적립이 MONTHLY보다 약 4.348배 더 많이 투입된다', () => {
    const weekly = projectPlanContributionGrowth({
      contributionType: 'AMOUNT',
      frequency: 'WEEKLY',
      value: 10_000,
      initialPrincipal: 0,
      annualReturnRatePercent: 0,
      months: 12
    })
    const monthly = projectPlanContributionGrowth({
      contributionType: 'AMOUNT',
      frequency: 'MONTHLY',
      value: 10_000,
      initialPrincipal: 0,
      annualReturnRatePercent: 0,
      months: 12
    })
    const ratio = weekly[weekly.length - 1].contributed / monthly[monthly.length - 1].contributed
    expect(ratio).toBeCloseTo(365.2425 / 7 / 12, 3)
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
