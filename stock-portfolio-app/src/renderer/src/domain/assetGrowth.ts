/**
 * 자산 증식 그래프를 위한 순수 계산.
 *
 * "실제 평가금액의 과거 추이"는 과거 시세 데이터가 없으면 알 수 없다 — 이 앱은 그런 히스토리
 * API를 쓰지 않으므로, 대신 두 가지를 따로 보여준다:
 *   1) 누적값(원금 또는 수량): 보유종목 등록일 + 매수/매도 기록 날짜로부터 계산되는,
 *      "지금까지 얼마를 넣었는가/몇 주를 보유해왔는가"의 실제 히스토리. 시세와 무관하게 정확하다.
 *      (buildCumulativeTimeline은 원금·수량 어느 쪽에든 쓸 수 있도록 일반화되어 있다 —
 *      종목 상세 페이지의 "보유수량 추이" 그래프도 이 함수를 재사용한다)
 *   2) 평가금액 스냅샷: 앱을 실행할 때마다(정확히는 이 화면을 열 때마다) 그 시점의 실제
 *      평가금액을 하루 1개씩 기록해서 쌓아가는 것. 오늘부터 시작되며 소급 적용은 안 된다.
 */

export interface CumulativeDelta {
  /** YYYY-MM-DD */
  date: string
  /** 증가(+)/감소(-) — 원금(금액)이든 수량이든 상관없이 쓸 수 있다 */
  amount: number
}

export interface CumulativePoint {
  date: string
  cumulativeValue: number
}

/** 날짜별 증감을 오래된 순으로 누적한다. 같은 날짜의 여러 건은 하나의 포인트로 합쳐진다 */
export function buildCumulativeTimeline(deltas: CumulativeDelta[]): CumulativePoint[] {
  const byDate = new Map<string, number>()
  for (const d of deltas) {
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.amount)
  }
  const sortedDates = [...byDate.keys()].sort()
  let running = 0
  return sortedDates.map((date) => {
    running += byDate.get(date) ?? 0
    return { date, cumulativeValue: running }
  })
}

export interface SnapshotPoint {
  date: string
  value: number
}

export interface GrowthChartPoint {
  date: string
  cumulativeCost?: number
  snapshotValue?: number
}

/**
 * 누적 투입원금(조밀한 데이터)과 평가금액 스냅샷(희소한 데이터)을 같은 날짜 축으로 합친다.
 * 원금은 계단식으로 이어지도록(직전 값을 유지) 채우고, 스냅샷은 실제 기록된 날짜에만 값을 둔다.
 */
export function mergeCostBasisAndSnapshots(costBasis: CumulativePoint[], snapshots: SnapshotPoint[]): GrowthChartPoint[] {
  const sortedCost = [...costBasis].sort((a, b) => a.date.localeCompare(b.date))
  const snapshotByDate = new Map(snapshots.map((s) => [s.date, s.value]))
  const allDates = [...new Set([...sortedCost.map((p) => p.date), ...snapshots.map((s) => s.date)])].sort()

  let lastCost: number | undefined
  let costIndex = 0
  return allDates.map((date) => {
    while (costIndex < sortedCost.length && sortedCost[costIndex].date <= date) {
      lastCost = sortedCost[costIndex].cumulativeValue
      costIndex++
    }
    return { date, cumulativeCost: lastCost, snapshotValue: snapshotByDate.get(date) }
  })
}
