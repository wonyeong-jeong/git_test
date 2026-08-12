import { describe, expect, it } from 'vitest'
import { buildMonthGrid, groupEventsByDate } from './calendar'

describe('buildMonthGrid', () => {
  it('항상 42칸(6주)을 만든다', () => {
    expect(buildMonthGrid(2026, 8)).toHaveLength(42)
  })

  it('2026년 8월 1일(토요일)이므로 그리드는 7/26(일)부터 시작한다', () => {
    const grid = buildMonthGrid(2026, 8)
    expect(grid[0]).toEqual({ date: '2026-07-26', inMonth: false })
  })

  it('이번 달 날짜에는 inMonth가 true다', () => {
    const grid = buildMonthGrid(2026, 8)
    const aug1 = grid.find((c) => c.date === '2026-08-01')
    const aug31 = grid.find((c) => c.date === '2026-08-31')
    expect(aug1?.inMonth).toBe(true)
    expect(aug31?.inMonth).toBe(true)
  })

  it('앞뒤 달을 채운 날짜에는 inMonth가 false다', () => {
    const grid = buildMonthGrid(2026, 8)
    const jul26 = grid.find((c) => c.date === '2026-07-26')
    expect(jul26?.inMonth).toBe(false)
  })
})

describe('groupEventsByDate', () => {
  it('같은 날짜 이벤트를 배열로 묶는다', () => {
    const grouped = groupEventsByDate([
      { date: '2026-08-10', type: 'BUY', label: '삼성전자 매수', amount: 100_000 },
      { date: '2026-08-10', type: 'DIVIDEND', label: '삼성전자 배당', amount: 5_000 },
      { date: '2026-08-15', type: 'SELL', label: '애플 매도', amount: 50_000 }
    ])
    expect(grouped['2026-08-10']).toHaveLength(2)
    expect(grouped['2026-08-15']).toHaveLength(1)
    expect(grouped['2026-08-20']).toBeUndefined()
  })

  it('빈 배열이면 빈 객체', () => {
    expect(groupEventsByDate([])).toEqual({})
  })
})
