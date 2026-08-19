import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Broker, Holding, ManualPurchase, Quote } from '../../types'
import { BROKER_LABELS } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'
import StockAvatar from '../../components/StockAvatar'
import MarketStatusBadge from '../../components/MarketStatusBadge'
import AutoRefreshControls from '../../components/AutoRefreshControls'
import { useAutoRefreshQuotes } from '../../hooks/useAutoRefreshQuotes'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { useFxRates } from '../../hooks/useFxRates'
import { deriveCurrentPosition } from '../../domain/position'
import { formatMoney } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
  onChanged: () => void
  onOpenDetail: (holdingId: string) => void
}

const BROKERS: Broker[] = ['KIS', 'KB', 'TOSS', 'KAKAOPAY', 'MANUAL']

/** 이 값 미만이면 "전량 매도로 청산됨"으로 본다 — 소수점 매수 부동소수점 오차를 0으로
 * 오인하지 않도록 아주 작은 허용치를 둔다. */
const CLOSED_POSITION_EPSILON = 0.0001

const emptyForm = {
  broker: 'KB' as Broker,
  ticker: '',
  name: '',
  quantity: '',
  avgPrice: '',
  currency: 'KRW' as 'KRW' | 'USD'
}

interface EditFormState {
  broker: Broker
  ticker: string
  name: string
  quantity: string
  avgPrice: string
  currency: 'KRW' | 'USD'
}

function toEditForm(h: Holding): EditFormState {
  return { broker: h.broker, ticker: h.ticker, name: h.name, quantity: String(h.quantity), avgPrice: String(h.avgPrice), currency: h.currency }
}

interface RowProps {
  holding: Holding
  purchases: ManualPurchase[]
  quote?: Quote
  onDelete: (id: string) => void
  onOpenDetail: (holdingId: string) => void
  /** true면 USD 종목을 원화로 환산해서 보여준다(usdKrw가 있을 때만 실제로 적용됨) */
  showKrw: boolean
  usdKrw: number | null
  isEditing: boolean
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSaveEdit: (id: string, updates: Omit<Holding, 'id' | 'profileId' | 'createdAt'>) => Promise<void>
}

/** 행을 별도 컴포넌트로 분리한 이유: useFlashOnChange는 각 행마다 독립적으로 상태를 가져야
 * 하는데, 부모의 .map() 콜백 안에서 직접 훅을 호출하면 Rules of Hooks를 어기게 된다. */
function HoldingRow({
  holding,
  purchases,
  quote,
  onDelete,
  onOpenDetail,
  showKrw,
  usdKrw,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit
}: RowProps): JSX.Element {
  const flash = useFlashOnChange(quote?.lastPrice)
  const [editForm, setEditForm] = useState<EditFormState>(() => toEditForm(holding))
  const [saving, setSaving] = useState(false)

  // Holding.quantity/avgPrice는 등록 시점 값 그대로라, 그 뒤 '매매 이력'에 기록한 실제
  // 매수/매도까지 반영한 진짜 현재 수량/평단가를 다시 계산해서 화면에 보여준다.
  const position = deriveCurrentPosition(
    holding,
    purchases.filter((p) => p.holdingId === holding.id)
  )
  const priceKnown = quote && quote.currency === holding.currency
  const pl = priceKnown ? (quote.lastPrice - position.avgPrice) * position.quantity : null
  const plPercent = pl !== null && position.totalCost > 0 ? (pl / position.totalCost) * 100 : null

  // 이 행에만 적용할 환산 배율. USD 종목이고 토글이 켜져 있고 환율을 실제로 가져왔을 때만 적용
  const convert = showKrw && holding.currency === 'USD' && usdKrw != null
  const fx = convert ? usdKrw : 1
  const displayCurrency = convert ? 'KRW' : holding.currency

  if (isEditing) {
    return (
      <tr>
        <td colSpan={7}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <label>
              증권사
              <select value={editForm.broker} onChange={(e) => setEditForm({ ...editForm, broker: e.target.value as Broker })}>
                {BROKERS.map((b) => (
                  <option key={b} value={b}>
                    {BROKER_LABELS[b]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              종목코드/티커
              <input value={editForm.ticker} onChange={(e) => setEditForm({ ...editForm, ticker: e.target.value })} />
            </label>
            <label>
              종목명
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </label>
            <label>
              등록 시점 수량
              <input
                type="number"
                min="0"
                step="any"
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              />
            </label>
            <label>
              등록 시점 평단가
              <input
                type="number"
                min="0"
                step="any"
                value={editForm.avgPrice}
                onChange={(e) => setEditForm({ ...editForm, avgPrice: e.target.value })}
              />
            </label>
            <label>
              통화
              <select
                value={editForm.currency}
                onChange={(e) => setEditForm({ ...editForm, currency: e.target.value as 'KRW' | 'USD' })}
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'end', paddingBottom: 1 }}>
              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await onSaveEdit(holding.id, {
                      broker: editForm.broker,
                      ticker: editForm.ticker,
                      name: editForm.name,
                      quantity: Number(editForm.quantity),
                      avgPrice: Number(editForm.avgPrice),
                      currency: editForm.currency
                    })
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                저장
              </button>
              <button type="button" className="link-plain" style={{ paddingBottom: 0 }} onClick={onCancelEdit}>
                취소
              </button>
            </div>
          </div>
          {purchases.some((p) => p.holdingId === holding.id) && (
            <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
              위 수량·평단가는 "등록 시점" 값입니다 — 이 종목엔 매매 이력이 있어서, 실제 현재 수량/평단가는 여기에
              그 이후 매수/매도 기록까지 반영해 다시 계산됩니다.
            </p>
          )}
        </td>
      </tr>
    )
  }

  return (
    <tr className="clickable-row" onClick={() => onOpenDetail(holding.id)}>
      <td>
        <span className="stock-name-cell">
          <StockAvatar ticker={holding.ticker} name={holding.name} />
          {holding.name} <span className="muted">({holding.ticker})</span>
        </span>
      </td>
      <td>{position.quantity.toLocaleString()}</td>
      <td>{formatMoney(position.avgPrice * fx, displayCurrency)}</td>
      <td>{formatMoney(position.totalCost * fx, displayCurrency)}</td>
      <td className={flash ? `flash-${flash}` : ''}>
        {quote ? formatMoney(quote.lastPrice * (convert ? fx : 1), convert ? displayCurrency : quote.currency) : '—'}
      </td>
      <td className={pl === null ? '' : pl >= 0 ? 'num-positive' : 'num-negative'}>
        {pl === null ? (
          '—'
        ) : (
          <>
            {pl >= 0 ? '+' : ''}
            {Math.round(pl * fx).toLocaleString()}
            {plPercent !== null && (
              <span className="small" style={{ marginLeft: 6, opacity: 0.85 }}>
                ({plPercent >= 0 ? '+' : ''}
                {plPercent.toFixed(1)}%)
              </span>
            )}
          </>
        )}
      </td>
      <td>
        <button
          className="link-plain"
          style={{ marginRight: 12 }}
          onClick={(e) => {
            e.stopPropagation()
            onStartEdit(holding.id)
          }}
        >
          수정
        </button>
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
  const [showKrw, setShowKrw] = useState(false)
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const { usdKrw, lastUpdated: fxLastUpdated } = useFxRates()

  useEffect(() => {
    window.api.manualPurchases.list(profileId).then(setPurchases)
  }, [profileId])

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

  // 매도해서 실제 보유수량이 0이 된 종목은(매매 이력에 전량 매도가 기록되면) 목록에서 자동으로
  // 빠진다 — 완전히 지우는 게 아니라(그러면 그 종목에 걸린 매매 이력·배당 기록의 종목명 표시가
  // 깨진다) "청산된 종목" 섹션으로 옮겨서, 필요하면 펼쳐볼 수 있게만 한다.
  const { activeHoldings, closedHoldings } = useMemo(() => {
    const active: Holding[] = []
    const closed: Holding[] = []
    for (const h of holdings) {
      const position = deriveCurrentPosition(
        h,
        purchases.filter((p) => p.holdingId === h.id)
      )
      if (position.quantity > CLOSED_POSITION_EPSILON) active.push(h)
      else closed.push(h)
    }
    return { activeHoldings: active, closedHoldings: closed }
  }, [holdings, purchases])

  const grouped = activeHoldings.reduce<Record<Broker, Holding[]>>(
    (acc, h) => {
      acc[h.broker] = acc[h.broker] ?? []
      acc[h.broker].push(h)
      return acc
    },
    {} as Record<Broker, Holding[]>
  )

  // 헤더의 "총 매입금액 ...원" 배지는 원화 표시라 KRW 종목만 합산한다(USD를 섞어 더치지 않기
  // 위해). 매매 이력까지 반영한 실제 투입원금(등록 시점 값 + 그 뒤 매수/매도)을 기준으로 한다.
  // 청산된(수량 0) 종목은 지금 들고 있는 게 없으므로 이 합계에서도 제외한다.
  const totalValue = activeHoldings
    .filter((h) => h.currency === 'KRW')
    .reduce((sum, h) => {
      const position = deriveCurrentPosition(
        h,
        purchases.filter((p) => p.holdingId === h.id)
      )
      return sum + position.totalCost
    }, 0)
  const heldCurrencies = [...new Set(activeHoldings.map((h) => h.currency))]
  const hasUsdHoldings = activeHoldings.some((h) => h.currency === 'USD')

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

  async function handleSaveEdit(holdingId: string, updates: Omit<Holding, 'id' | 'profileId' | 'createdAt'>): Promise<void> {
    await window.api.holdings.update(profileId, holdingId, updates)
    setEditingId(null)
    onChanged()
  }

  function renderTable(list: Holding[]): JSX.Element {
    return (
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
          {list.map((h) => (
            <HoldingRow
              key={h.id}
              holding={h}
              purchases={purchases}
              quote={quotes[h.ticker]}
              onDelete={handleDelete}
              onOpenDetail={onOpenDetail}
              showKrw={showKrw}
              usdKrw={usdKrw}
              isEditing={editingId === h.id}
              onStartEdit={setEditingId}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={handleSaveEdit}
            />
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>보유 종목</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MarketStatusBadge currencies={heldCurrencies} />
          <button className="primary" onClick={refreshNow} disabled={priceStatus === 'loading' || activeHoldings.length === 0}>
            {priceStatus === 'loading' ? '현재가 불러오는 중...' : '현재가 새로고침'}
          </button>
          <div className="summary-pill">총 매입금액 {totalValue.toLocaleString()}원</div>
        </div>
      </div>

      {activeHoldings.length > 0 && (
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

      {hasUsdHoldings && (
        <div className="auto-refresh-controls">
          <label>
            <input
              type="checkbox"
              checked={showKrw}
              disabled={usdKrw == null}
              onChange={(e) => setShowKrw(e.target.checked)}
            />
            달러 종목을 원화로 환산해서 보기
          </label>
          {usdKrw != null ? (
            <span>
              적용 환율 1 USD = {usdKrw.toLocaleString()}원
              {fxLastUpdated && ` (${fxLastUpdated.toLocaleTimeString()} 기준)`}
            </span>
          ) : (
            <span className="muted">환율 불러오는 중…</span>
          )}
        </div>
      )}

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
      {holdings.length > 0 && activeHoldings.length === 0 && (
        <p className="empty-hint">지금 들고 있는 종목이 없어요(전부 매도했거나 청산됨). 아래 "청산된 종목"에서 확인할 수 있어요.</p>
      )}

      {(Object.keys(grouped) as Broker[]).map((broker) => (
        <section key={broker} className="broker-group">
          <h2>{BROKER_LABELS[broker]}</h2>
          {renderTable(grouped[broker])}
        </section>
      ))}

      {closedHoldings.length > 0 && (
        <section className="broker-group">
          <button type="button" className="link-plain" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? '▾' : '▸'} 청산된 종목 (전량 매도, {closedHoldings.length}개)
          </button>
          {showClosed && (
            <>
              <p className="muted small" style={{ marginTop: 8 }}>
                매매 이력에서 전량 매도가 기록되어 현재 보유수량이 0인 종목입니다. 목록에서만 빠져 있을 뿐 매매·배당
                기록은 그대로 남아있고, 다시 매수하면 자동으로 위 목록에 나타납니다.
              </p>
              {renderTable(closedHoldings)}
            </>
          )}
        </section>
      )}
    </div>
  )
}
