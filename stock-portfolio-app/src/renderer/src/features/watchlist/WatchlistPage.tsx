import { useEffect, useRef, useState } from 'react'
import type { Quote, WatchlistItem } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'

const AUTO_REFRESH_INTERVAL_OPTIONS = [
  { label: '15초마다', seconds: 15 },
  { label: '30초마다', seconds: 30 },
  { label: '1분마다', seconds: 60 },
  { label: '5분마다', seconds: 300 }
]

/** 자격증명 오류 등으로 계속 실패할 때 API를 무한히 두드리지 않도록 자동 갱신을 멈추는 기준 */
const MAX_CONSECUTIVE_FAILURES = 3

interface Props {
  profileId: string
}

export default function WatchlistPage({ profileId }: Props): JSX.Element {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [manualEntry, setManualEntry] = useState(false)
  const [manualTicker, setManualTicker] = useState('')
  const [manualName, setManualName] = useState('')
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [priceStatus, setPriceStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState(30)

  // 인터벌 콜백 안에서 최신 상태를 참조하기 위한 ref들 (state를 그대로 쓰면 클로저가 오래된 값을 가짐)
  const inFlightRef = useRef(false)
  const failureCountRef = useRef(0)
  const autoRefreshRef = useRef(autoRefresh)

  useEffect(() => {
    autoRefreshRef.current = autoRefresh
  }, [autoRefresh])

  async function refresh(): Promise<void> {
    setItems(await window.api.watchlist.list(profileId))
  }

  useEffect(() => {
    refresh()
  }, [profileId])

  async function addItem(ticker: string, name: string, currency: 'KRW' | 'USD'): Promise<void> {
    if (!ticker || !name) return
    await window.api.watchlist.create(profileId, { ticker, name, currency })
    refresh()
  }

  async function handleDelete(id: string): Promise<void> {
    await window.api.watchlist.delete(profileId, id)
    refresh()
  }

  async function handleRefreshPrices(): Promise<void> {
    if (items.length === 0 || inFlightRef.current) return
    inFlightRef.current = true
    setPriceStatus('loading')
    setPriceError(null)
    try {
      const results = await window.api.broker.getQuotes(items.map((i) => i.ticker))
      const map: Record<string, Quote> = {}
      for (const q of results) map[q.symbol] = q
      setQuotes(map)
      setPriceStatus('idle')
      setLastUpdated(new Date())
      failureCountRef.current = 0
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failureCountRef.current += 1
      setPriceStatus('error')
      if (autoRefreshRef.current && failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setAutoRefresh(false)
        setPriceError(`${message} (자동 갱신 ${MAX_CONSECUTIVE_FAILURES}회 연속 실패로 중지됨)`)
      } else {
        setPriceError(message)
      }
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!autoRefresh || items.length === 0) return
    const id = setInterval(() => {
      handleRefreshPrices()
    }, intervalSeconds * 1000)
    return () => clearInterval(id)
    // handleRefreshPrices는 매 렌더마다 새로 만들어지지만 items/profileId 변화 시에만
    // 인터벌을 다시 걸면 충분하므로 의도적으로 의존성에서 제외한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, intervalSeconds, items])

  return (
    <div>
      <div className="page-header">
        <h1>관심종목</h1>
        <button className="primary" onClick={handleRefreshPrices} disabled={priceStatus === 'loading' || items.length === 0}>
          {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
        </button>
      </div>

      {items.length > 0 && (
        <div className="watchlist-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => {
                failureCountRef.current = 0
                setAutoRefresh(e.target.checked)
              }}
            />
            자동 갱신
          </label>
          <select
            value={intervalSeconds}
            disabled={!autoRefresh}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          >
            {AUTO_REFRESH_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.seconds} value={opt.seconds}>
                {opt.label}
              </option>
            ))}
          </select>
          {lastUpdated && <span>마지막 갱신 {lastUpdated.toLocaleTimeString()}</span>}
        </div>
      )}

      {priceError && <p className="status-error">현재가 조회 실패: {priceError}</p>}

      <div className="card">
        {manualEntry ? (
          <div className="form-grid">
            <label>
              종목코드/티커
              <input value={manualTicker} onChange={(e) => setManualTicker(e.target.value)} placeholder="예: AAPL" />
            </label>
            <label>
              종목명
              <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="예: Apple" />
            </label>
            <button
              type="button"
              className="primary"
              onClick={() => {
                addItem(manualTicker, manualName, 'USD')
                setManualTicker('')
                setManualName('')
              }}
            >
              관심종목 추가
            </button>
          </div>
        ) : (
          <label>
            종목 검색 (국내 상장종목)
            <StockSearchInput onSelect={(o: StockOption) => addItem(o.code, o.name, 'KRW')} />
          </label>
        )}
        <button type="button" className="link-plain" onClick={() => setManualEntry((v) => !v)}>
          {manualEntry ? '종목 검색으로 전환' : '해외주식 등 목록에 없으면 직접 입력'}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="empty-hint">관심종목이 없습니다. 위에서 검색해서 추가해보세요.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>종목</th>
              <th>현재가</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const quote = quotes[item.ticker]
              return (
                <tr key={item.id}>
                  <td>
                    {item.name} <span className="muted">({item.ticker})</span>
                  </td>
                  <td>{quote ? `${quote.lastPrice.toLocaleString()} ${quote.currency}` : '—'}</td>
                  <td>
                    <button className="link-danger" onClick={() => handleDelete(item.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
