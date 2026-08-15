/** 소수점 매수 수량 표시용 — 지저분한 부동소수점 꼬리를 잘라내되 소수점 자체는 살린다 */
export function formatQuantity(q: number): string {
  return q.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

/**
 * 금액을 통화와 함께 표시한다. KRW를 하드코딩한 "원" 표기가 USD 종목(해외 ETF 등)에도
 * 그대로 붙어서 실제로는 달러 금액인데 원화처럼 보이는 문제가 있었다 — 반드시 이 함수를
 * 통해 종목의 실제 currency를 붙여서 표시할 것.
 */
export function formatMoney(value: number, currency: string): string {
  return `${Math.round(value).toLocaleString()} ${currency}`
}

/** 차트 Y축 눈금 — KRW는 "만원" 단위가 익숙하지만 USD에 10000으로 나눠 "만"을 붙이면 틀린 표시가 된다 */
export function formatAxisTick(value: number, currency: string): string {
  return currency === 'KRW' ? `${Math.round(value / 10000)}만` : Math.round(value).toLocaleString()
}
