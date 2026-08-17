/**
 * 보유종목(Holding)에는 등록 시점의 수량/평단가만 저장되고, 그 이후 '매매 이력'
 * (TransactionsPage)에 기록한 추가 매수/매도는 자동으로 반영되지 않는다 — Holding 자체를
 * 수정하는 기능이 없기 때문이다. 그래서 "지금 진짜 몇 주를, 평균 얼마에 들고 있는가"를
 * 정확히 알려면 등록 시점 값 위에 그동안의 매매 기록을 다시 적용해서 계산해야 한다.
 *
 * 매도 시 가중평균 원가법(weighted-average cost)을 쓴다 — 매도해도 남은 수량의 평단가는
 * 그대로 유지되고, 원가 총액에서 판 만큼(판매가가 아니라 그 시점 평균원가 기준)만 줄어든다.
 * 이건 '누적 투입원금' 그래프(assetGrowth.ts가 쓰는 순현금흐름 방식)와는 다른 개념이다 —
 * 여긴 평가손익 계산에 쓸 "남은 주식의 원가"가 필요한 거라 방식이 다르다.
 */

export interface PositionBase {
  quantity: number
  avgPrice: number
}

export interface TradeLike {
  date: string // YYYY-MM-DD
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
}

export interface DerivedPosition {
  quantity: number
  avgPrice: number
  totalCost: number
}

export function deriveCurrentPosition(base: PositionBase, trades: TradeLike[]): DerivedPosition {
  let quantity = base.quantity
  let totalCost = base.quantity * base.avgPrice

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))

  for (const t of sorted) {
    if (t.side === 'BUY') {
      quantity += t.quantity
      totalCost += t.quantity * t.price
    } else {
      const avgPriceBeforeSale = quantity === 0 ? 0 : totalCost / quantity
      quantity -= t.quantity
      totalCost -= t.quantity * avgPriceBeforeSale
    }
  }

  quantity = Math.max(quantity, 0)
  totalCost = Math.max(totalCost, 0)
  const avgPrice = quantity === 0 ? 0 : totalCost / quantity

  return { quantity, avgPrice, totalCost }
}
