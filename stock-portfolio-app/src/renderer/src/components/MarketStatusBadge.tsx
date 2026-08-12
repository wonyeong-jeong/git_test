import { useEffect, useState } from 'react'
import { getMarketSession, getSessionLabel } from '../domain/marketHours'

interface Props {
  /** 목록에 실제로 존재하는 통화들. 없는 시장의 배지는 표시하지 않는다 */
  currencies: Array<'KRW' | 'USD'>
}

const FLAG: Record<'KRW' | 'USD', string> = { KRW: '🇰🇷', USD: '🇺🇸' }

/** 지금이 장중/시간외/장마감인지 보여주는 배지. 30초마다 스스로 갱신한다 (네트워크 요청 없음). */
export default function MarketStatusBadge({ currencies }: Props): JSX.Element | null {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const unique = [...new Set(currencies)]
  if (unique.length === 0) return null

  return (
    <div className="market-status">
      {unique.map((currency) => {
        const session = getMarketSession(currency)
        return (
          <span key={currency} className={`market-status-pill session-${session.toLowerCase()}`}>
            {FLAG[currency]} {getSessionLabel(currency, session)}
          </span>
        )
      })}
    </div>
  )
}
