import { useEffect, useState } from 'react'
import type { Quote, WatchlistItem } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'
import StockAvatar from '../../components/StockAvatar'
import MarketStatusBadge from '../../components/MarketStatusBadge'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'

interface Props {
  profileId: string
  onOpenDetail: (item: WatchlistItem) => void
}

interface RowProps {
  item: WatchlistItem
  quote?: Quote
  onDelete: (id: string) => void
  onOpenDetail: (item: WatchlistItem) => void
}

/** 행을 별도 컴포넌트로 분리한 이유: useFlashOnChange 같은 훅은 각 행마다 독립적으로 상태를
 * 가져야 하는데, 부모의 .map() 콜백 안에서 직접 훅을 호출하면 Rules of Hooks를 어기게 된다. */
function WatchlistRow({ item, quote, onDelete, onOpenDetail }: RowProps): JSX.Element {
  const flash = useFlashOnChange(quote?.lastPrice)

  return (
    <tr className="clickable-row" onClick={() => onOpenDetail(item)}>
      <td>
        <span className="stock-name-cell">
          <StockAvatar ticker={item.ticker} name={item.name} />
          {item.name} <span className="muted">({item.ticker})</span>
        </span>
      </td>
      <td className={flash ? `flash-${flash}` : ''}>
        {quote ? `${quote.lastPrice.toLocaleString()} ${quote.currency}` : '—'}
      </td>
      <td>
        <button
          className="link-danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item.id)
          }}
        >
          삭제
        </button>
      </td>
    </tr>
  )
}

export default function WatchlistPage({ profileId, onOpenDetail }: Props): JSX.Element {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [manualEntry, setManualEntry] = useState(false)
  const [manualTicker, setManualTicker] = useState('')
  const [manualName, setManualName] = useState('')

  const {
    quotes,
    status: priceStatus,
    error: priceError,
    lastUpdated,
    autoRefresh,
    setAutoRefresh,
    intervalSeconds,
    setIntervalSeconds,
    marketsClosedNow,
    refreshNow
  } = useAutoRefreshQuotes(items)

  async function refresh(): Promise<void> {
    setItems(await window.api.watchlist.list(profileId))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const watchedCurrencies = [...new Set(items.map((i) => i.currency))]

  return (
    <div>
      <div className="page-header">
        <h1>관심종목</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MarketStatusBadge currencies={watchedCurrencies} />
          <button className="primary" onClick={refreshNow} disabled={priceStatus === 'loading' || items.length === 0}>
            {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <AutoRefreshControls
          enabled={autoRefresh}
          onToggle={setAutoRefresh}
          intervalSeconds={intervalSeconds}
          onIntervalChange={setIntervalSeconds}
          lastUpdated={lastUpdated}
          marketsClosedNow={marketsClosedNow}
        />
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
            {items.map((item) => (
              <WatchlistRow
                key={item.id}
                item={item}
                quote={quotes[item.ticker]}
                onDelete={handleDelete}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
