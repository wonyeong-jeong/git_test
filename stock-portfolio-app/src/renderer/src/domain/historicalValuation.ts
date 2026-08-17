/**
 * "적립식 매수를 과거부터 해왔는데, 평가금액도 과거로 소급해서 볼 수 없는가" — 실제 과거 시세
 * (main/marketData/naverClient.ts의 getHistoricalPrices)를 가져올 수 있게 되면서 가능해졌다.
 *
 * 계산 방식: 종목별로 "그 날짜에 몇 주를 들고 있었는가"(수량 타임라인)와 "그 날짜의 종가가
 * 얼마였는가"(시세 타임라인)를 각각 계단 함수로 만들고, 두 계단 함수를 곱해서 그 날짜의
 * 평가금액을 구한다. 두 타임라인의 날짜가 서로 안 맞아도(예: 국내는 일별, 해외는 주별/월별
 * 캔들) "그 날짜 이전에 가장 최근에 알려진 값"을 쓰는 방식(lastAtOrBefore)이라 그대로 맞물린다.
 *
 * position.ts의 deriveCurrentPosition과 달리 여기서는 가중평균 원가가 필요 없고 "그 시점의
 * 순수 보유 수량"만 있으면 되므로 별도 함수로 둔다.
 */

export interface TradeLike {
  date: string
  side: 'BUY' | 'SELL'
  quantity: number
}

export interface QuantityPoint {
  date: string
  quantity: number
}

export interface PricePoint {
  date: string
  close: number
}

/** baseDate 시점에 baseQuantity를 들고 시작해서, 그 뒤 매매 기록을 날짜 순서대로 적용한
 * "보유수량 계단 함수"를 만든다. 반환값은 date 오름차순으로 정렬되어 있다. */
export function buildQuantityTimeline(baseDate: string, baseQuantity: number, trades: TradeLike[]): QuantityPoint[] {
  const points: QuantityPoint[] = [{ date: baseDate, quantity: baseQuantity }]
  let quantity = baseQuantity
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    quantity += t.side === 'BUY' ? t.quantity : -t.quantity
    points.push({ date: t.date, quantity: Math.max(quantity, 0) })
  }
  return points
}

/** points는 date 오름차순 정렬이 전제됨. date 이전(같은 날 포함)에 존재하는 값 중 가장 최근
 * 것을 찾는다 — 못 찾으면(그 날짜가 시작일보다 앞이면) undefined. */
function lastAtOrBefore<T extends { date: string }>(points: T[], date: string): T | undefined {
  let result: T | undefined
  for (const p of points) {
    if (p.date <= date) result = p
    else break
  }
  return result
}

export interface HoldingHistoricalSeries {
  quantityTimeline: QuantityPoint[]
  pricePoints: PricePoint[]
}

export interface HistoricalValuePoint {
  date: string
  historicalValue: number
}

/** 같은 통화의 종목 여러 개를 한 화면에 합쳐서 "그 날짜의 전체 평가금액" 시계열을 만든다.
 * 날짜 그리드는 입력으로 받은 모든 종목의 시세 날짜를 합집합해서 쓴다 — 종목마다 시세 조회
 * 범위(일/주/월봉)가 달라도 그 그리드 위에서 각자 lastAtOrBefore로 값을 채워 넣으면 맞아떨어진다.
 * 어떤 종목이 특정 날짜보다 더 과거의 시세를 못 구했다면(해외주식 조회 한계), 그 날짜엔 그
 * 종목만 0으로 취급되어 전체 합계가 실제보다 적게 잡힐 수 있다 — 호출부에서 이 한계를 안내한다. */
export function buildHistoricalValueSeries(seriesList: HoldingHistoricalSeries[]): HistoricalValuePoint[] {
  const allDates = [...new Set(seriesList.flatMap((s) => s.pricePoints.map((p) => p.date)))].sort()
  return allDates.map((date) => {
    const historicalValue = seriesList.reduce((sum, s) => {
      const price = lastAtOrBefore(s.pricePoints, date)?.close ?? 0
      const qty = lastAtOrBefore(s.quantityTimeline, date)?.quantity ?? 0
      return sum + price * qty
    }, 0)
    return { date, historicalValue }
  })
}
