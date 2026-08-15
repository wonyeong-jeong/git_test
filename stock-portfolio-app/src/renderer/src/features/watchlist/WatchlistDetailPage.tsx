import { useMemo } from 'react'
import type { WatchlistItem } from '../../types'
import StockAvatar from '../../components/StockAvatar'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'

interface Props {
  item: WatchlistItem
  onBack: () => void
}

/**
 * 아직 '보유 종목'으로 등록되지 않은 관심종목의 가벼운 상세 화면.
 * 매수/매도 기록이 없어서 투입원금·수량 추이·배당 이력은 계산할 수 없다 — 그건
 * StockDetailPage(보유 종목 상세)의 역할이고, 같은 티커의 보유종목이 있으면 App.tsx가
 * 자동으로 그쪽으로 연결한다. 여기서는 실시간 시세만 보여준다.
 */
export default function WatchlistDetailPage({ item, onBack }: Props): JSX.Element {
  const watchedSelf = useMemo(() => [{ ticker: item.ticker, currency: item.currency }], [item.ticker, item.currency])
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
  } = useAutoRefreshQuotes(watchedSelf)

  const quote = quotes[item.ticker]
  const flash = useFlashOnChange(quote?.lastPrice)

  return (
    <div>
      <button type="button" className="link-plain" onClick={onBack} style={{ marginBottom: 12, display: 'block' }}>
        ← 관심종목 목록으로
      </button>

      <div className="page-header">
        <h1>
          <span className="stock-name-cell">
            <StockAvatar ticker={item.ticker} name={item.name} />
            {item.name}{' '}
            <span className="muted" style={{ fontWeight: 400, fontSize: 15 }}>
              ({item.ticker})
            </span>
          </span>
        </h1>
        <button className="primary" onClick={refreshNow} disabled={priceStatus === 'loading'}>
          {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
        </button>
      </div>

      <AutoRefreshControls
        enabled={autoRefresh}
        onToggle={setAutoRefresh}
        intervalSeconds={intervalSeconds}
        onIntervalChange={setIntervalSeconds}
        lastUpdated={lastUpdated}
        marketsClosedNow={marketsClosedNow}
      />

      {priceError && <p className="status-error">현재가 조회 실패: {priceError}</p>}

      <div className="card">
        <div className="summary-cards">
          <div className="summary-card">
            <span className="label">통화</span>
            <span className="value">{item.currency}</span>
          </div>
          <div className={`summary-card ${flash ? `flash-${flash}` : ''}`}>
            <span className="label">현재가</span>
            <span className="value">{quote ? `${quote.lastPrice.toLocaleString()} ${quote.currency}` : '—'}</span>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          관심종목 등록일 {item.createdAt.slice(0, 10)}
        </p>
      </div>

      <p className="empty-hint">
        아직 '보유 종목'으로 등록되지 않은 종목이라 투입원금·보유수량 추이와 배당 이력은 보여드릴 수 없어요. '보유
        종목'에 같은 티커({item.ticker})로 등록하면, 다음에 이 종목을 클릭할 때 자동으로 그 정보까지 함께 보이는
        상세 화면으로 연결됩니다.
      </p>
    </div>
  )
}
