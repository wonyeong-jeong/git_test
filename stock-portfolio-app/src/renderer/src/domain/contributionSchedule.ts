/**
 * 적립식 계획(주기·금액·시작일)으로부터 "예정된" 매수 회차를 자동 생성한다.
 * 실제 매수 체결은 사용자가 별도로 입력하므로, 이 모듈은 순수하게 일정만 계산한다.
 */

export type ContributionFrequency = 'MONTHLY' | 'WEEKLY'

export interface ContributionScheduleInput {
  frequency: ContributionFrequency
  amount: number
  startDate: string // ISO date (YYYY-MM-DD)
  endDate?: string // ISO date, 없으면 horizonMonths까지
  dayOfMonth?: number // MONTHLY일 때만 사용, 기본은 startDate의 일자
}

export interface ScheduledContributionEvent {
  date: string // ISO date
  plannedAmount: number
}

/**
 * @param horizonMonths startDate로부터 몇 개월치 회차를 생성할지 (endDate가 있으면 그쪽이 우선)
 */
export function generateScheduleEvents(
  input: ContributionScheduleInput,
  horizonMonths = 12
): ScheduledContributionEvent[] {
  const start = new Date(input.startDate + 'T00:00:00')
  // endDate가 명시되지 않으면 horizonMonths만큼만 생성되도록 경계일 하루 전까지로 제한한다
  // (그렇지 않으면 시작일과 정확히 horizonMonths 뒤인 날짜의 회차까지 포함되어 1개 더 생성됨)
  const end = input.endDate
    ? new Date(input.endDate + 'T00:00:00')
    : addDays(addMonths(start, horizonMonths), -1)

  const events: ScheduledContributionEvent[] = []

  if (input.frequency === 'MONTHLY') {
    const day = input.dayOfMonth ?? start.getDate()
    let cursor = new Date(start.getFullYear(), start.getMonth(), day)
    if (cursor < start) cursor = addMonths(cursor, 1)

    while (cursor <= end) {
      events.push({ date: toIsoDate(cursor), plannedAmount: input.amount })
      cursor = addMonths(cursor, 1)
    }
  } else {
    let cursor = new Date(start)
    while (cursor <= end) {
      events.push({ date: toIsoDate(cursor), plannedAmount: input.amount })
      cursor = addDays(cursor, 7)
    }
  }

  return events
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetDay = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(targetDay, daysInTargetMonth))
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
