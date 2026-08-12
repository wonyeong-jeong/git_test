import { describe, expect, it } from 'vitest'
import { applyFxConversionFee, calculateCapitalGainsTax, calculateDividendTax } from './tax'

describe('calculateCapitalGainsTax', () => {
  it('국내주식은 기본적으로 비과세다', () => {
    const result = calculateCapitalGainsTax({
      market: 'DOMESTIC',
      totalContributed: 10_000_000,
      projectedValue: 15_000_000
    })
    expect(result.taxAmount).toBe(0)
    expect(result.netValue).toBe(15_000_000)
    expect(result.netProfit).toBe(5_000_000)
  })

  it('손실이면 세금이 없다 (해외주식도 동일)', () => {
    const result = calculateCapitalGainsTax({
      market: 'OVERSEAS',
      totalContributed: 10_000_000,
      projectedValue: 8_000_000
    })
    expect(result.grossProfit).toBe(-2_000_000)
    expect(result.taxAmount).toBe(0)
  })

  it('해외주식은 기본공제 250만원을 넘는 수익에만 22% 과세한다', () => {
    const result = calculateCapitalGainsTax({
      market: 'OVERSEAS',
      totalContributed: 10_000_000,
      projectedValue: 15_000_000 // 수익 5,000,000
    })
    // 과세대상 = 5,000,000 - 2,500,000 = 2,500,000
    // 세금 = 2,500,000 * 22% = 550,000
    expect(result.taxableProfit).toBe(2_500_000)
    expect(result.taxAmount).toBe(550_000)
    expect(result.netProfit).toBe(4_450_000)
    expect(result.netValue).toBe(14_450_000)
  })

  it('해외주식 수익이 기본공제 이하면 세금이 0이다', () => {
    const result = calculateCapitalGainsTax({
      market: 'OVERSEAS',
      totalContributed: 10_000_000,
      projectedValue: 12_000_000 // 수익 2,000,000 < 2,500,000 공제
    })
    expect(result.taxAmount).toBe(0)
    expect(result.netProfit).toBe(2_000_000)
  })

  it('assumptions로 세율/공제를 조정할 수 있다', () => {
    const result = calculateCapitalGainsTax({
      market: 'OVERSEAS',
      totalContributed: 0,
      projectedValue: 1_000_000,
      assumptions: { overseasCapitalGainsTaxRatePercent: 10, overseasCapitalGainsBasicDeductionKRW: 0 }
    })
    expect(result.taxAmount).toBe(100_000)
  })
})

describe('calculateDividendTax', () => {
  it('기본 15.4%를 원천징수한다', () => {
    const result = calculateDividendTax(1_000_000)
    expect(result.taxAmount).toBeCloseTo(154_000, 6)
    expect(result.netDividend).toBeCloseTo(846_000, 6)
  })
})

describe('applyFxConversionFee', () => {
  it('기본 1% 환전수수료를 적용한다', () => {
    const result = applyFxConversionFee(1_000_000)
    expect(result.feeAmount).toBe(10_000)
    expect(result.netAmount).toBe(990_000)
  })
})
