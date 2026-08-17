import { describe, expect, it } from 'vitest'
import { generateScheduleEvents, nextScheduledEvents } from './contributionSchedule'

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

  it('DAILY는 영업일(월~금)만 생성하고 주말은 건너뛴다', () => {
    // 2026-01-01은 목요일 → 목,금,(토,일 건너뜀),월,화,수,목
    const events = generateScheduleEvents(
      { frequency: 'DAILY', amount: 10_000, startDate: '2026-01-01', endDate: '2026-01-08' }
    )
    expect(events.map((e) => e.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08'
    ])
  })

  it('DAILY 시작일이 주말이면 다음 월요일로 밀려서 시작한다', () => {
    // 2026-01-03은 토요일
    const events = generateScheduleEvents(
      { frequency: 'DAILY', amount: 10_000, startDate: '2026-01-03', endDate: '2026-01-06' }
    )
    expect(events.map((e) => e.date)).toEqual(['2026-01-05', '2026-01-06'])
  })
})

describe('nextScheduledEvents', () => {
  it('startDate가 훨씬 과거여도(이미 몇 달 전부터 모아온 계획) 기준일 이전 회차는 건너뛰고 그 이후만 반환한다', () => {
    const events = nextScheduledEvents(
      { frequency: 'WEEKLY', amount: 50_000, startDate: '2026-02-03' },
      '2026-08-17',
      3
    )
    // 2/3부터 매주 반복되는 요일 패턴을 유지한 채, 8/17 이후 첫 회차부터 3개
    expect(events.every((e) => e.date >= '2026-08-17')).toBe(true)
    expect(events).toHaveLength(3)
    // 요일 패턴이 유지되는지(7일 간격) 확인
    const days = events.map((e) => new Date(e.date + 'T00:00:00').getDay())
    expect(new Set(days).size).toBe(1)
  })

  it('MONTHLY도 기준일 이전 회차를 건너뛰고 day-of-month 패턴을 유지한다', () => {
    const events = nextScheduledEvents(
      { frequency: 'MONTHLY', amount: 300_000, startDate: '2025-02-15' },
      '2026-08-17',
      2
    )
    expect(events[0].date).toBe('2026-09-15')
    expect(events[1].date).toBe('2026-10-15')
  })

  it('계획이 아직 시작 전(startDate가 기준일보다 미래)이면 시작일부터 반환한다', () => {
    const events = nextScheduledEvents(
      { frequency: 'MONTHLY', amount: 100_000, startDate: '2027-01-01' },
      '2026-08-17',
      2
    )
    expect(events[0].date).toBe('2027-01-01')
  })

  it('endDate를 지나면 그 이상 회차를 만들지 않는다', () => {
    const events = nextScheduledEvents(
      { frequency: 'MONTHLY', amount: 100_000, startDate: '2026-01-01', endDate: '2026-09-01' },
      '2026-08-17',
      5
    )
    expect(events.map((e) => e.date)).toEqual(['2026-09-01'])
  })

  it('DAILY도 기준일 이전 회차는 건너뛰고, 주말 없이 영업일만 반환한다', () => {
    const events = nextScheduledEvents(
      { frequency: 'DAILY', amount: 10_000, startDate: '2026-01-01' },
      '2026-08-17',
      5
    )
    expect(events).toHaveLength(5)
    expect(events.every((e) => e.date >= '2026-08-17')).toBe(true)
    const weekdays = events.map((e) => new Date(e.date + 'T00:00:00').getDay())
    expect(weekdays.every((d) => d >= 1 && d <= 5)).toBe(true)
  })
})
