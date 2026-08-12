import type { CompoundProjectionPoint } from './compound'

/**
 * 배당 관련 순수 계산. 실제 배당금 지급은 회사 정책·업황에 따라 바뀌므로, 여기서는
 * "가정 연 배당수익률(현재 평가금액 기준)"을 사용자가 입력하면 그걸로 미래 기대 배당금을
 * 추정한다 — 실제 배당 예측이 아니라 what-if 도구다.
 */

export interface DividendProjectionPoint {
  month: number
  /** 그 시점 평가금액 기준 연간 예상 배당금 (세전) */
  expectedAnnualDividend: number
}

export function projectExpectedDividends(
  points: CompoundProjectionPoint[],
  assumedDividendYieldPercent: number
): DividendProjectionPoint[] {
  const rate = assumedDividendYieldPercent / 100
  return points.map((p) => ({ month: p.month, expectedAnnualDividend: p.value * rate }))
}

/** 종목별 기대 배당금 곡선을 월 단위로 합산한다 (목표4의 배당 버전) */
export function aggregateDividendProjections(
  projections: DividendProjectionPoint[][]
): DividendProjectionPoint[] {
  if (projections.length === 0) return []
  const months = Math.max(...projections.map((p) => p.length))
  const result: DividendProjectionPoint[] = []
  for (let m = 0; m < months; m++) {
    let total = 0
    for (const proj of projections) {
      const point = proj[m] ?? proj[proj.length - 1]
      if (point) total += point.expectedAnnualDividend
    }
    result.push({ month: m, expectedAnnualDividend: total })
  }
  return result
}

export interface DividendRecordLike {
  date: string // ISO date
  amount: number
}

/** sinceDate(YYYY-MM-DD) 이상인 기록만 합산. 생략하면 전체 합산 */
export function sumDividendRecords(records: DividendRecordLike[], sinceDate?: string): number {
  return records.filter((r) => !sinceDate || r.date >= sinceDate).reduce((sum, r) => sum + r.amount, 0)
}

export type DividendGranularity = 'WEEK' | 'MONTH' | 'YEAR'

export interface DividendBucket {
  /** 정렬 가능한 키 (예: '2026-03', '2026-W07', '2026') */
  key: string
  /** 화면 표시용 라벨 */
  label: string
  total: number
}

/** ISO 8601 주차(연-Www). 목요일이 속한 연도를 그 주의 연도로 보는 표준 규칙을 따른다 */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const target = new Date(d.valueOf())
  const mondayIndexedDay = (d.getDay() + 6) % 7 // 월=0 ... 일=6
  target.setDate(target.getDate() - mondayIndexedDay + 3) // 그 주의 목요일로 이동

  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstMondayIndexedDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstMondayIndexedDay + 3)

  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${target.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

function bucketKeyAndLabel(date: string, granularity: DividendGranularity): { key: string; label: string } {
  if (granularity === 'YEAR') {
    const year = date.slice(0, 4)
    return { key: year, label: `${year}년` }
  }
  if (granularity === 'MONTH') {
    const key = date.slice(0, 7) // YYYY-MM
    const [y, m] = key.split('-')
    return { key, label: `${y}년 ${Number(m)}월` }
  }
  const key = isoWeekKey(date)
  return { key, label: key }
}

/** 배당 기록을 주/월/년 단위로 합산한다. 결과는 오래된 순으로 정렬된다 */
export function groupDividendsByPeriod(records: DividendRecordLike[], granularity: DividendGranularity): DividendBucket[] {
  const totals = new Map<string, { label: string; total: number }>()
  for (const r of records) {
    const { key, label } = bucketKeyAndLabel(r.date, granularity)
    const cur = totals.get(key) ?? { label, total: 0 }
    cur.total += r.amount
    totals.set(key, cur)
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: v.label, total: v.total }))
}
