import { FormEvent, useState } from 'react'
import type { Broker, Holding, Quote } from '../../types'
import { BROKER_LABELS } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'
import StockAvatar from '../../components/StockAvatar'
import MarketStatusBadge from '../../components/MarketStatusBadge'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'

interface Props {
  profileId: string
  holdings: Holding[]
  onChanged: () => void
  onOpenDetail: (holdingId: string) => void
}

const BROKERS: Broker[] = ['KIS', 'KB', 'TOSS', 'KAKAOPAY', 'MANUAL']

const emptyForm = {
  broker: 'KB' as Broker,
  ticker: '',
  name: '',
  quantity: '',
  avgPrice: '',
  currency: 'KRW' as 'KRW' | 'USD'
}

interface RowProps {
  holding: Holding
  quote?: Quote
  onDelete: (id: string) => void
  onOpenDetail: (holdingId: string) => void
}

/** 행을 별도 컴포넌트로 분리한 이유: useFlashOnChange는 각 행마다 독립적으로 상태를 가져야
 * 하는데, 부모의 .map() 콜백 안에서 직접 훅을 호출하면 Rules of Hooks를 어기게 된다. */
function HoldingRow({ holding, quote, onDelete, onOpenDetail }: RowProps): JSX.Element {
  const flash = useFlashOnChange(quote?.lastPrice)
  const priceKnown = quote && quote.currency === holding.currency
  const pl = priceKnown ? (quote.lastPrice - holding.avgPrice) * holding.quantity : null

  return (
    <tr className="clickable-row" onClick={() => onOpenDetail(holding.id)}>
      <td>
        <span className="stock-name-cell">
          <StockAvatar ticker={holding.ticker} name={holding.name} />
          {holding.name} <span className="muted">({holding.ticker})</span>
        </span>
      </td>
      <td>{holding.quantity.toLocaleString()}</td>
      <td>
        {holding.avgPrice.toLocaleString()} {holding.currency}
      </td>
      <td>{(holding.quantity * holding.avgPrice).toLocaleString()}</td>
      <td className={flash ? `flash-${flash}` : ''}>
        {quote ? `${quote.lastPrice.toLocaleString()} ${quote.currency}` : '—'}
      </td>
      <td className={pl === null ? '' : pl >= 0 ? 'num-positive' : 'num-negative'}>
        {pl === null ? '—' : `${pl >= 0 ? '+' : ''}${Math.round(pl).toLocaleString()}`}
      </td>
      <td>
        <button
          className="link-danger"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(holding.id)
          }}
        >
          삭제
        </button>
      </td>
    </tr>
  )
}

export default function HoldingsPage({ profileId, holdings, onChanged, onOpenDetail }: Props): JSX.Element {
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)

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
  } = useAutoRefreshQuotes(holdings)

  function handleStockSelect(option: StockOption): void {
    setForm((f) => ({ ...f, ticker: option.code, name: option.name, currency: 'KRW' }))
  }

  const grouped = holdings.reduce<Record<Broker, Holding[]>>(
    (acc, h) => {
      acc[h.broker] = acc[h.broker] ?? []
      acc[h.broker].push(h)
      return acc
    },
    {} as Record<Broker, Holding[]>
  )

  const totalValue = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0)
  const heldCurrencies = [...new Set(holdings.map((h) => h.currency))]

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.ticker || !form.name || !form.quantity || !form.avgPrice) return
    setSubmitting(true)
    try {
      await window.api.holdings.create(profileId, {
        broker: form.broker,
        ticker: form.ticker,
        name: form.name,
        quantity: Number(form.quantity),
        avgPrice: Number(form.avgPrice),
        currency: form.currency
      })
      setForm(emptyForm)
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(holdingId: string): Promise<void> {
    await window.api.holdings.delete(profileId, holdingId)
    onChanged()
  }

  return (
    <div>
      <div className="page-header">
        <h1>보유 종목</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MarketStatusBadge currencies={heldCurrencies} />
          <button className="primary" onClick={refreshNow} disabled={priceStatus === 'loading' || holdings.length === 0}>
            {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
          </button>
          <div className="summary-pill">총 매입금액 {totalValue.toLocaleString()}원</div>
        </div>
      </div>

      {holdings.length > 0 && (
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

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          증권사
          <select value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value as Broker })}>
            {BROKERS.map((b) => (
              <option key={b} value={b}>
                {BROKER_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        {manualEntry ? (
          <>
            <label>
              종목코드/티커
              <input
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                placeholder="예: AAPL"
              />
            </label>
            <label>
              종목명
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: Apple" />
            </label>
          </>
        ) : (
          <label>
            종목 검색 (국내 상장종목)
            <StockSearchInput onSelect={handleStockSelect} />
          </label>
        )}
        {form.ticker && form.name && (
          <div className="stock-selected">
            선택됨: <strong>{form.name}</strong> <span className="muted">({form.ticker})</span>
          </div>
        )}
        <button
          type="button"
          className="link-plain"
          onClick={() => {
            setManualEntry((v) => !v)
            setForm((f) => ({ ...f, ticker: '', name: '' }))
          }}
        >
          {manualEntry ? '종목 검색으로 전환' : '해외주식 등 목록에 없으면 직접 입력'}
        </button>
        <label>
          수량
          <input
            type="number"
            min="0"
            step="any"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </label>
        <label>
          평단가
          <input
            type="number"
            min="0"
            step="any"
            value={form.avgPrice}
            onChange={(e) => setForm({ ...form, avgPrice: e.target.value })}
          />
        </label>
        <label>
          통화
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'KRW' | 'USD' })}>
            <option value="KRW">KRW</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <button type="submit" disabled={submitting} className="primary">
          종목 추가
        </button>
      </form>

      {holdings.length === 0 && <p className="empty-hint">아직 등록된 보유 종목이 없습니다. 위 폼으로 추가해보세요.</p>}

      {(Object.keys(grouped) as Broker[]).map((broker) => (
        <section key={broker} className="broker-group">
          <h2>{BROKER_LABELS[broker]}</h2>
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th>수량</th>
                <th>평단가</th>
                <th>매입금액</th>
                <th>현재가</th>
                <th>평가손익</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped[broker].map((h) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  quote={quotes[h.ticker]}
                  onDelete={handleDelete}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
