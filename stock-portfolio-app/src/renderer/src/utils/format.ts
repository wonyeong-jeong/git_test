/** 소수점 매수 수량 표시용 — 지저분한 부동소수점 꼬리를 잘라내되 소수점 자체는 살린다 */
export function formatQuantity(q: number): string {
  return q.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
