import { describe, expect, it } from 'vitest'
import { evaluatePortfolioInsights } from './portfolioInsights'

describe('evaluatePortfolioInsights', () => {
  it('한 종목이 50% 이상이면 집중도 HIGH', () => {
    const result = evaluatePortfolioInsights(
      [
        { holdingId: '1', name: '삼성전자', valueKrw: 6_000_000 },
        { holdingId: '2', name: 'QLD', valueKrw: 4_000_000 }
      ],
      { KRW: 6_000_000, USD: 4_000_000 }
    )
    expect(result.topHolding).toEqual({ name: '삼성전자', sharePercent: 60 })
    expect(result.concentrationLevel).toBe('HIGH')
  })

  it('1위 비중이 30~50%면 MEDIUM, 30% 미만이면 LOW', () => {
    const medium = evaluatePortfolioInsights(
      [
        { holdingId: '1', name: 'A', valueKrw: 4_000_000 },
        { holdingId: '2', name: 'B', valueKrw: 3_000_000 },
        { holdingId: '3', name: 'C', valueKrw: 3_000_000 }
      ],
      { KRW: 10_000_000 }
    )
    expect(medium.concentrationLevel).toBe('MEDIUM')

    const low = evaluatePortfolioInsights(
      [
        { holdingId: '1', name: 'A', valueKrw: 2_000_000 },
        { holdingId: '2', name: 'B', valueKrw: 2_000_000 },
        { holdingId: '3', name: 'C', valueKrw: 2_000_000 },
        { holdingId: '4', name: 'D', valueKrw: 2_000_000 },
        { holdingId: '5', name: 'E', valueKrw: 2_000_000 }
      ],
      { KRW: 10_000_000 }
    )
    expect(low.concentrationLevel).toBe('LOW')
  })

  it('종목이 3개 미만이면 분산도 LOW, 3~7개면 MEDIUM, 8개 이상이면 HIGH', () => {
    const single = evaluatePortfolioInsights([{ holdingId: '1', name: 'A', valueKrw: 100 }], { KRW: 100 })
    expect(single.diversificationLevel).toBe('LOW')

    const five = evaluatePortfolioInsights(
      Array.from({ length: 5 }, (_, i) => ({ holdingId: String(i), name: `H${i}`, valueKrw: 100 })),
      { KRW: 500 }
    )
    expect(five.diversificationLevel).toBe('MEDIUM')

    const eight = evaluatePortfolioInsights(
      Array.from({ length: 8 }, (_, i) => ({ holdingId: String(i), name: `H${i}`, valueKrw: 100 })),
      { KRW: 800 }
    )
    expect(eight.diversificationLevel).toBe('HIGH')
  })

  it('통화별 비중을 %로 계산한다', () => {
    const result = evaluatePortfolioInsights(
      [{ holdingId: '1', name: 'A', valueKrw: 1_000_000 }],
      { KRW: 700_000, USD: 300_000 }
    )
    expect(result.currencySharePercent).toEqual({ KRW: 70, USD: 30 })
  })

  it('종목이 없으면 topHolding은 null, 집중도는 LOW', () => {
    const result = evaluatePortfolioInsights([], {})
    expect(result.topHolding).toBeNull()
    expect(result.concentrationLevel).toBe('LOW')
    expect(result.currencySharePercent).toEqual({})
  })
})
