/**
 * 달력 화면을 위한 순수 계산. 실제 이벤트 수집(매수/매도/배당/적립 예정일)은 페이지 쪽에서
 * 하고, 여기서는 "월 그리드를 어떻게 그릴지"와 "이벤트를 날짜별로 어떻게 묶을지"만 담당한다.
 */

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string
  /** 현재 보고 있는 달에 속하는 날짜인지 (앞뒤 달의 채움 날짜는 false) */
  inMonth: boolean
}

/** year/month(1~12)의 달력 그리드를 6주(42칸) x 일~토 형태로 만든다 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startWeekday = firstOfMonth.getDay() // 0=일
  const gridStart = new Date(year, month - 1, 1 - startWeekday)

  const cells: CalendarCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ date: toIsoDate(d), inMonth: d.getMonth() === month - 1 })
  }
  return cells
}

export type CalendarEventType = 'BUY' | 'SELL' | 'DIVIDEND' | 'SCHEDULED_CONTRIBUTION'

export interface CalendarEvent {
  date: string // YYYY-MM-DD
  type: CalendarEventType
  label: string
  amount: number
}

export function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    ;(map[ev.date] ??= []).push(ev)
  }
  return map
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
