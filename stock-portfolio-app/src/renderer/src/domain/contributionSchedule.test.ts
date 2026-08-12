import { describe, expect, it } from 'vitest'
import { generateScheduleEvents } from './contributionSchedule'

describe('generateScheduleEvents', () => {
  it('매월 회차를 12개월치 생성한다 (endDate 없을 때 horizonMonths 기준)', () => {
    const events = generateScheduleEvents(
      { frequency: 'MONTHLY', amount: 300_000, startDate: '2026-01-15' },
      12
    )
    expect(events).toHaveLength(12)
    expect(events[0].date).toBe('2026-01-15')
    expect(events[1].date).toBe('2026-02-15')
    expect(events.every((e) => e.plannedAmount === 300_000)).toBe(true)
  })

  it('endDate가 있으면 그 이후 회차는 생성하지 않는다', () => {
    const events = generateScheduleEvents({
      frequency: 'MONTHLY',
      amount: 100_000,
      startDate: '2026-01-01',
      endDate: '2026-03-01'
    })
    expect(events).toHaveLength(3)
    expect(events[2].date).toBe('2026-03-01')
  })

  it('월말 시작일(31일)도 다음달 일수에 맞춰 안전하게 클램프한다', () => {
    const events = generateScheduleEvents(
      { frequency: 'MONTHLY', amount: 50_000, startDate: '2026-01-31' },
      3
    )
    // 2월은 31일이 없으므로 2월의 마지막 날로 클램프되어야 한다
    expect(events[1].date).toBe('2026-02-28')
  })

  it('WEEKLY는 7일 간격으로 회차를 생성한다', () => {
    const events = generateScheduleEvents(
      { frequency: 'WEEKLY', amount: 50_000, startDate: '2026-01-01', endDate: '2026-01-22' }
    )
    expect(events.map((e) => e.date)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22'])
  })
})
