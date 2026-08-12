import { getBrandColor, getStockInitial } from '../utils/brandColor'

interface Props {
  ticker: string
  name: string
}

/** 종목명 옆에 붙는 색상 원형 배지. 실제 로고 대신 티커 기반 고유 색상 + 이니셜을 쓴다. */
export default function StockAvatar({ ticker, name }: Props): JSX.Element {
  return (
    <span className="stock-avatar" style={{ background: getBrandColor(ticker) }}>
      {getStockInitial(name)}
    </span>
  )
}
