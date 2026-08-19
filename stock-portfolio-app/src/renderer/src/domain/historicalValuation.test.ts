import { describe, expect, it } from 'vitest'
import { buildHistoricalValueSeries, buildQuantityTimeline, findNearestPrice } from './historicalValuation'

describe('buildQuantityTimeline', () => {
  it('매매 기록이 없으면 시작 수량만 담긴 타임라인을 반환한다', () => {
    expect(buildQuantityTimeline('2024-01-01', 10, [])).toEqual([{ date: '2024-01-01', quantity: 10 }])
  })

  it('매수/매도를 날짜 순서대로(입력 순서와 무관하게) 누적 반영한다', () => {
    const timeline = buildQuantityTimeline('2024-01-01', 10, [
      { date: '2024-03-01', side: 'BUY', quantity: 5 },
      { date: '2024-02-01', side: 'SELL', quantity: 3 }
    ])
    expect(timeline).toEqual([
      { date: '2024-01-01', quantity: 10 },
      { date: '2024-02-01', quantity: 7 },
      { date: '2024-03-01', quantity: 12 }
    ])
  })

  it('매도로 수량이 음수가 되지 않도록 0에서 막는다', () => {
    const timeline = buildQuantityTimeline('2024-01-01', 5, [{ date: '2024-02-01', side: 'SELL', quantity: 999 }])
    expect(timeline[timeline.length - 1].quantity).toBe(0)
  })
})

describe('buildHistoricalValueSeries', () => {
  it('시세 날짜 그리드 위에서 수량×종가를 계산해 종목 하나짜리 시계열을 만든다', () => {
    const series = buildHistoricalValueSeries([
      {
        quantityTimeline: [
          { date: '2024-01-01', quantity: 10 },
          { date: '2024-01-03', quantity: 20 }
        ],
        pricePoints: [
          { date: '2024-01-01', close: 100 },
          { date: '2024-01-02', close: 110 },
          { date: '2024-01-03', close: 120 }
        ]
      }
    ])
    expect(series).toEqual([
      { date: '2024-01-01', historicalValue: 1000 },
      { date: '2024-01-02', historicalValue: 1100 }, // 아직 10주(1/3 매수 전)
      { date: '2024-01-03', historicalValue: 2400 } // 1/3부터 20주
    ])
  })

  it('두 종목을 합칠 때 시세 날짜 그리드가 달라도(일봉 vs 주봉 느낌) 합집합 위에서 맞물려 합산된다', () => {
    const series = buildHistoricalValueSeries([
      {
        quantityTimeline: [{ date: '2024-01-01', quantity: 1 }],
        pricePoints: [
          { date: '2024-01-01', close: 100 },
          { date: '2024-01-05', close: 100 }
        ]
      },
      {
        quantityTimeline: [{ date: '2024-01-01', quantity: 2 }],
        pricePoints: [{ date: '2024-01-03', close: 50 }]
      }
    ])
    // 그리드는 {01, 03, 05}. 01엔 두 번째 종목 시세가 아직 없어(그 종목만 0으로 처리) 첫 종목분만 잡힌다.
    expect(series).toEqual([
      { date: '2024-01-01', historicalValue: 100 },
      { date: '2024-01-03', historicalValue: 100 + 100 }, // 첫 종목 01 종가 유지(100) + 둘째 종목 03 종가(50)*2주
      { date: '2024-01-05', historicalValue: 100 + 100 }
    ])
  })

  it('입력이 비어 있으면 빈 배열을 반환한다', () => {
    expect(buildHistoricalValueSeries([])).toEqual([])
  })
})

describe('findNearestPrice', () => {
  const points = [
    { date: '2024-01-05', close: 100 },
    { date: '2024-01-08', close: 110 },
    { date: '2024-01-12', close: 120 }
  ]

  it('정확히 그 날짜의 시세가 있으면 그걸 쓴다', () => {
    expect(findNearestPrice(points, '2024-01-08')).toEqual({ date: '2024-01-08', close: 110 })
  })

  it('그 날짜에 거래가 없으면(주말 등) 바로 이전 종가를 쓴다', () => {
    // 1/10(토요일 가정)에 시세가 없으면 1/8 종가를 대신 쓴다
    expect(findNearestPrice(points, '2024-01-10')).toEqual({ date: '2024-01-08', close: 110 })
  })

  it('조회 범위가 그 날짜보다 늦게 시작해서 이전 값이 없으면 그 이후 첫 값을 대신 쓴다', () => {
    expect(findNearestPrice(points, '2024-01-01')).toEqual({ date: '2024-01-05', close: 100 })
  })

  it('시세가 아예 없으면 null을 반환한다', () => {
    expect(findNearestPrice([], '2024-01-08')).toBeNull()
  })
})
