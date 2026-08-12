import { useEffect, useState } from 'react'
import type { Quote, WatchlistItem } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'

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
    if (items.length === 0) return
    setPriceStatus('loading')
    setPriceError(null)
    try {
      const results = await window.api.broker.getQuotes(items.map((i) => i.ticker))
      const map: Record<string, Quote> = {}
      for (const q of results) map[q.symbol] = q
      setQuotes(map)
      setPriceStatus('idle')
    } catch (err) {
      setPriceStatus('error')
      setPriceError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>관심종목</h1>
        <button className="primary" onClick={handleRefreshPrices} disabled={priceStatus === 'loading' || items.length === 0}>
          {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
        </button>
      </div>

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
