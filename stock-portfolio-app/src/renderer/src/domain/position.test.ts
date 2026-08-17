import { describe, expect, it } from 'vitest'
import { deriveCurrentPosition } from './position'

describe('deriveCurrentPosition', () => {
  it('매매 기록이 없으면 등록 시점 값 그대로다', () => {
    const pos = deriveCurrentPosition({ quantity: 10, avgPrice: 100 }, [])
    expect(pos).toEqual({ quantity: 10, avgPrice: 100, totalCost: 1000 })
  })

  it('매수만 있으면 가중평균으로 평단가가 재계산된다', () => {
    // 10주@100원(1000) + 5주@200원(1000) = 15주, 원가 2000, 평단가 133.33...
    const pos = deriveCurrentPosition({ quantity: 10, avgPrice: 100 }, [
      { date: '2026-02-01', side: 'BUY', quantity: 5, price: 200 }
    ])
    expect(pos.quantity).toBe(15)
    expect(pos.totalCost).toBe(2000)
    expect(pos.avgPrice).toBeCloseTo(133.333, 2)
  })

  it('매도해도 남은 수량의 평단가는 그대로 유지된다(가중평균 원가법)', () => {
    // 10주@100원 보유 중 4주를 150원에 매도 -> 원가는 판매가가 아니라 평단가(100) 기준으로 차감
    const pos = deriveCurrentPosition({ quantity: 10, avgPrice: 100 }, [
      { date: '2026-02-01', side: 'SELL', quantity: 4, price: 150 }
    ])
    expect(pos.quantity).toBe(6)
    expect(pos.totalCost).toBe(600) // 1000 - 4*100
    expect(pos.avgPrice).toBe(100)
  })

  it('매수-매도-매수가 섞이면 날짜 순서대로 적용된다(입력 순서와 무관하게)', () => {
    // 1/1 10주@100 매수 -> 원가1000,평단100
    // 2/1 4주@120 매도  -> 원가 1000-4*100=600, 수량6, 평단 100 유지
    // 3/1 4주@200 매수  -> 원가 600+800=1400, 수량10, 평단140
    const pos = deriveCurrentPosition(
      { quantity: 0, avgPrice: 0 },
      [
        { date: '2026-03-01', side: 'BUY', quantity: 4, price: 200 }, // 입력 순서를 일부러 섞음
        { date: '2026-01-01', side: 'BUY', quantity: 10, price: 100 },
        { date: '2026-02-01', side: 'SELL', quantity: 4, price: 120 }
      ]
    )
    expect(pos.quantity).toBe(10)
    expect(pos.totalCost).toBe(1400)
    expect(pos.avgPrice).toBe(140)
  })

  it('전량 매도하면 수량과 원가가 0이 된다(음수로 내려가지 않음)', () => {
    const pos = deriveCurrentPosition({ quantity: 10, avgPrice: 100 }, [
      { date: '2026-02-01', side: 'SELL', quantity: 10, price: 150 }
    ])
    expect(pos).toEqual({ quantity: 0, avgPrice: 0, totalCost: 0 })
  })
})
