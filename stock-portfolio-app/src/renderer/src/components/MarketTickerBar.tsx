import { useFxRates } from '../hooks/useFxRates'
import { useMarketIndices } from '../hooks/useMarketIndices'

interface TickerItem {
  key: string
  name: string
  value: number
  changeRatio: number
  isRising: boolean
  isFx: boolean
}

/**
 * 상단에 코스피/코스닥/나스닥 등 주요 지수와 원/달러 등 환율을 흘러가는 티커 형태로 보여준다.
 * 순수 장식/정보성 요소라 데이터를 못 가져와도(네트워크 오류, 네이버 쪽 응답 구조 변경 등)
 * 앱 기능에는 영향이 없어야 한다 — 그래서 에러가 나면 조용히 아무것도 안 그린다.
 */
export default function MarketTickerBar(): JSX.Element | null {
  const { rates } = useFxRates()
  const { indices } = useMarketIndices()

  const items: TickerItem[] = [
    ...rates.map((r) => ({
      key: r.code,
      name: r.name,
      value: r.rate,
      changeRatio: r.changeRatio,
      isRising: r.changeAmount >= 0,
      isFx: true
    })),
    ...indices.map((i) => ({
      key: i.code,
      name: i.name,
      value: i.price,
      changeRatio: i.changeRatio,
      isRising: i.changeAmount >= 0,
      isFx: false
    }))
  ]

  if (items.length === 0) return null

  function renderItem(item: TickerItem, keySuffix: string): JSX.Element {
    return (
      <span key={`${item.key}-${keySuffix}`} className="market-ticker-item">
        <span className="muted">{item.name}</span>
        <span className={item.isRising ? 'num-positive' : 'num-negative'}>
          {item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {item.isFx ? '원' : ''} {item.isRising ? '▲' : '▼'} {Math.abs(item.changeRatio).toFixed(2)}%
        </span>
      </span>
    )
  }

  return (
    <div className="market-ticker">
      <div className="market-ticker-track">
        {items.map((item) => renderItem(item, 'a'))}
        {items.map((item) => renderItem(item, 'b'))}
      </div>
    </div>
  )
}
