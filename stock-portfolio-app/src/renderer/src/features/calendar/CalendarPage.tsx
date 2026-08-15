import { useEffect, useMemo, useState } from 'react'
import type { ContributionPlan, DividendRecord, Holding, ManualPurchase } from '../../types'
import { generateScheduleEvents } from '../../domain/contributionSchedule'
import { buildMonthGrid, groupEventsByDate, type CalendarEvent, type CalendarEventType } from '../../domain/calendar'
import { formatQuantity } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const EVENT_TYPE_META: Record<CalendarEventType, { label: string; dotClass: string }> = {
  BUY: { label: '매수', dotClass: 'cal-dot-buy' },
  SELL: { label: '매도', dotClass: 'cal-dot-sell' },
  DIVIDEND: { label: '배당', dotClass: 'cal-dot-dividend' },
  SCHEDULED_CONTRIBUTION: { label: '적립 예정', dotClass: 'cal-dot-scheduled' }
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarPage({ profileId, holdings }: Props): JSX.Element {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1~12
  const [selectedDate, setSelectedDate] = useState<string>(todayIso())

  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [dividends, setDividends] = useState<DividendRecord[]>([])
  const [plans, setPlans] = useState<ContributionPlan[]>([])

  useEffect(() => {
    window.api.manualPurchases.list(profileId).then(setPurchases)
    window.api.dividends.list(profileId).then(setDividends)
    window.api.contributionPlans.list(profileId).then(setPlans)
  }, [profileId])

  function holdingLabel(holdingId: string): string {
    const h = holdings.find((x) => x.id === holdingId)
    return h ? `${h.name}(${h.ticker})` : '(삭제된 종목)'
  }

  const events = useMemo<CalendarEvent[]>(() => {
    const buySell: CalendarEvent[] = purchases.map((p) => ({
      date: p.date,
      type: p.side ?? 'BUY',
      label: `${holdingLabel(p.holdingId)} ${p.side === 'SELL' ? '매도' : '매수'} ${p.quantity.toLocaleString()}주`,
      amount: p.quantity * p.price
    }))

    const dividendEvents: CalendarEvent[] = dividends.map((d) => ({
      date: d.date,
      type: 'DIVIDEND',
      label: `${holdingLabel(d.holdingId)} 배당`,
      amount: d.amount
    }))

    // 적립식 계획의 "예정" 회차. 계획 시작일이 오래됐을 수 있어 넉넉히 36개월치를 생성해서
    // 이번 달을 포함할 가능성을 높인다 — 실제 표시는 어차피 현재 보고 있는 달의 날짜만 쓴다.
    // 수량 기준 계획은 generateScheduleEvents가 반환하는 plannedAmount를 "수량"으로 재해석해서,
    // 보유종목 평단가로 대략적인 금액을 환산해 CalendarEvent.amount(항상 금액)에 채운다.
    const scheduled: CalendarEvent[] = plans
      .filter((p) => p.active)
      .flatMap((p) => {
        const holding = holdings.find((h) => h.id === p.holdingId)
        return generateScheduleEvents(
          { frequency: p.frequency, amount: p.amount, startDate: p.startDate, endDate: p.endDate, dayOfMonth: p.dayOfMonth },
          36
        ).map((ev) => {
          if (p.contributionType === 'QUANTITY') {
            const estimatedAmount = ev.plannedAmount * (holding?.avgPrice ?? 0)
            return {
              date: ev.date,
              type: 'SCHEDULED_CONTRIBUTION' as const,
              label: `${p.name} 적립 예정 (${formatQuantity(ev.plannedAmount)}주, 평단가 기준 추정금액)`,
              amount: estimatedAmount
            }
          }
          return {
            date: ev.date,
            type: 'SCHEDULED_CONTRIBUTION' as const,
            label: `${p.name} 적립 예정`,
            amount: ev.plannedAmount
          }
        })
      })

    return [...buySell, ...dividendEvents, ...scheduled]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, dividends, plans, holdings])

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events])
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  function goToPrevMonth(): void {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1)
      setViewMonth(12)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function goToNextMonth(): void {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1)
      setViewMonth(1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  function goToToday(): void {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth() + 1)
    setSelectedDate(todayIso())
  }

  const selectedEvents = eventsByDate[selectedDate] ?? []

  return (
    <div>
      <div className="page-header">
        <h1>캘린더</h1>
      </div>

      <div className="card">
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button type="button" className="link-plain" onClick={goToPrevMonth}>
              ◀ 이전달
            </button>
            <strong>
              {viewYear}년 {viewMonth}월
            </strong>
            <button type="button" className="link-plain" onClick={goToNextMonth}>
              다음달 ▶
            </button>
          </div>
          <button type="button" className="link-plain" onClick={goToToday}>
            오늘
          </button>
        </div>

        <div className="calendar-legend">
          {(Object.keys(EVENT_TYPE_META) as CalendarEventType[]).map((type) => (
            <span key={type} className="calendar-legend-item">
              <span className={`cal-dot ${EVENT_TYPE_META[type].dotClass}`} />
              {EVENT_TYPE_META[type].label}
            </span>
          ))}
        </div>

        <div className="calendar-weekdays">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="calendar-grid">
          {grid.map((cell) => {
            const dayEvents = eventsByDate[cell.date] ?? []
            const isToday = cell.date === todayIso()
            const isSelected = cell.date === selectedDate
            return (
              <button
                type="button"
                key={cell.date}
                className={[
                  'calendar-cell',
                  cell.inMonth ? '' : 'out-of-month',
                  isToday ? 'today' : '',
                  isSelected ? 'selected' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelectedDate(cell.date)}
              >
                <span className="calendar-cell-day">{Number(cell.date.slice(-2))}</span>
                {dayEvents.length > 0 && (
                  <span className="calendar-cell-dots">
                    {dayEvents.slice(0, 4).map((ev, i) => (
                      <span key={i} className={`cal-dot ${EVENT_TYPE_META[ev.type].dotClass}`} />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 15 }}>{selectedDate}</h2>
        {selectedEvents.length === 0 ? (
          <p className="empty-hint">이 날짜에는 기록된 매수·매도·배당·적립 예정 일정이 없어요.</p>
        ) : (
          <ul className="upcoming-list">
            {selectedEvents.map((ev, i) => (
              <li key={i}>
                <span className={`cal-dot ${EVENT_TYPE_META[ev.type].dotClass}`} /> {ev.label} —{' '}
                {Math.round(ev.amount).toLocaleString()}원
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
