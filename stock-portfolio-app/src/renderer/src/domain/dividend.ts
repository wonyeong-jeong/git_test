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
