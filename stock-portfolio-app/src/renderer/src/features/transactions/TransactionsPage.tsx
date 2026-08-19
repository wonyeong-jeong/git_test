import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Broker, Holding, ManualPurchase, TradeSide } from '../../types'
import { BROKER_LABELS } from '../../types'
import StockSearchInput, { type StockOption } from '../../components/StockSearchInput'
import { AUTO_RECORD_NOTE_PREFIX } from '../../domain/contributionSchedule'
import { formatMoney } from '../../utils/format'

interface Props {
  profileId: string
  holdings: Holding[]
  /** 새 종목을 자동으로 보유종목에 추가했을 때 부모(App)의 holdings 목록을 다시 불러오게 함 */
  onHoldingsChanged: () => void
}

type Mode = 'EXISTING' | 'NEW'

const BROKERS: Broker[] = ['KIS', 'KB', 'TOSS', 'KAKAOPAY', 'MANUAL']

const emptyForm = {
  holdingId: '',
  side: 'BUY' as TradeSide,
  date: new Date().toISOString().slice(0, 10),
  quantity: '',
  price: '',
  note: ''
}

const emptyNewStockForm = {
  broker: 'KB' as Broker,
  ticker: '',
  name: '',
  currency: 'KRW' as 'KRW' | 'USD'
}

const SIDE_LABELS: Record<TradeSide, string> = { BUY: '매수', SELL: '매도' }

export default function TransactionsPage({ profileId, holdings, onHoldingsChanged }: Props): JSX.Element {
  const [records, setRecords] = useState<ManualPurchase[]>([])
  const [form, setForm] = useState(emptyForm)
  const [mode, setMode] = useState<Mode>('EXISTING')
  const [newStockForm, setNewStockForm] = useState(emptyNewStockForm)
  const [manualEntry, setManualEntry] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function refresh(): Promise<void> {
    setRecords(await window.api.manualPurchases.list(profileId))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  function handleStockSelect(option: StockOption): void {
    setNewStockForm((f) => ({ ...f, ticker: option.code, name: option.name, currency: 'KRW' }))
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.quantity || !form.price) return
    setSubmitting(true)
    try {
      let holdingId = form.holdingId
      if (mode === 'NEW') {
        if (!newStockForm.ticker || !newStockForm.name) return
        // 매매 이력만 기록하고 보유종목엔 없는 상태를 피하기 위해, 새 종목이면 수량/평단가
        // 0인 '빈' 보유종목을 먼저 만들고 그 위에 이번 매수 기록을 얹는다 — deriveCurrentPosition이
        // 등록 시점 값(0) + 매매 기록을 합산하는 방식이라, 이렇게 해도 실제 보유수량·평단가는
        // 이번 매수 기록 하나만으로 정확히 계산된다(등록일에 가짜 원금이 잡히지도 않는다).
        const holding = await window.api.holdings.create(profileId, {
          broker: newStockForm.broker,
          ticker: newStockForm.ticker,
          name: newStockForm.name,
          quantity: 0,
          avgPrice: 0,
          currency: newStockForm.currency
        })
        holdingId = holding.id
      }
      if (!holdingId) return

      await window.api.manualPurchases.create(profileId, {
        holdingId,
        side: mode === 'NEW' ? 'BUY' : form.side,
        date: form.date,
        quantity: Number(form.quantity),
        price: Number(form.price),
        note: form.note || undefined
      })
      setForm({ ...emptyForm, side: form.side })
      setNewStockForm(emptyNewStockForm)
      setManualEntry(false)
      refresh()
      if (mode === 'NEW') onHoldingsChanged()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    await window.api.manualPurchases.delete(profileId, id)
    refresh()
  }

  function holdingLabel(holdingId: string): string {
    const h = holdings.find((x) => x.id === holdingId)
    return h ? `${h.name} (${h.ticker})` : '(삭제된 종목)'
  }

  function holdingCurrency(holdingId: string): string {
    return holdings.find((h) => h.id === holdingId)?.currency ?? 'KRW'
  }

  // "새 종목"으로 기록하려는 티커가 이미 보유종목에 있으면(브로커가 달라 새로 추가하려는 게
  // 아닌 이상) 중복 등록일 가능성이 높으므로 미리 알려준다 — 막지는 않고 안내만 한다.
  const matchingExistingHolding =
    mode === 'NEW' && newStockForm.ticker
      ? holdings.find((h) => h.ticker.toUpperCase() === newStockForm.ticker.toUpperCase())
      : null

  // 매도 기록은 수량/금액을 마이너스로 반영해서 "순매수" 기준으로 집계한다
  const byHolding = useMemo(() => {
    const map = new Map<string, { quantity: number; amount: number }>()
    for (const r of records) {
      const sign = r.side === 'SELL' ? -1 : 1
      const cur = map.get(r.holdingId) ?? { quantity: 0, amount: 0 }
      cur.quantity += sign * r.quantity
      cur.amount += sign * r.quantity * r.price
      map.set(r.holdingId, cur)
    }
    return [...map.entries()].map(([holdingId, v]) => ({
      holdingId,
      quantity: v.quantity,
      amount: v.amount,
      avgPrice: v.quantity === 0 ? 0 : v.amount / v.quantity
    }))
  }, [records])

  // KRW/USD를 그냥 더하면 안 되므로(환율 미지원) 통화별로 따로 순매수금액을 집계한다 — 예전엔
  // 전부 더해서 무조건 "원"으로 찍는 버그가 있었다(달러 종목 매매까지 원화인 것처럼 표시됨).
  const netAmountByCurrency = useMemo(() => {
    const result: Record<string, number> = {}
    for (const r of records) {
      const currency = holdingCurrency(r.holdingId)
      const sign = r.side === 'SELL' ? -1 : 1
      result[currency] = (result[currency] ?? 0) + sign * r.quantity * r.price
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, holdings])

  return (
    <div>
      <div className="page-header">
        <h1>매매 이력</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(netAmountByCurrency).map(([currency, amount]) => (
            <div key={currency} className="summary-pill">
              순매수금액 {formatMoney(amount, currency)}
            </div>
          ))}
        </div>
      </div>

      <p className="muted small" style={{ marginTop: -8, marginBottom: 20 }}>
        이 앱은 실제 주문을 넣지 않습니다. 증권사 앱에서 직접 매수/매도한 뒤, 그 체결 내역을 여기에 기록해서 이력을
        관리하는 용도입니다. 아직 보유종목 목록에 없는 종목을 매수했다면 "새 종목"으로 기록하면 보유종목에 자동으로
        추가됩니다.
      </p>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          종목
          <div className="period-toggle" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={mode === 'EXISTING' ? 'active' : ''}
              onClick={() => setMode('EXISTING')}
            >
              기존 보유종목
            </button>
            <button type="button" className={mode === 'NEW' ? 'active' : ''} onClick={() => setMode('NEW')}>
              새 종목 (자동 추가)
            </button>
          </div>
        </label>

        {mode === 'EXISTING' ? (
          <>
            <label>
              보유종목
              <select value={form.holdingId} onChange={(e) => setForm({ ...form, holdingId: e.target.value })}>
                <option value="">선택하세요</option>
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.ticker})
                  </option>
                ))}
              </select>
            </label>
            <label>
              매수/매도
              <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as TradeSide })}>
                <option value="BUY">매수</option>
                <option value="SELL">매도</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              증권사
              <select
                value={newStockForm.broker}
                onChange={(e) => setNewStockForm({ ...newStockForm, broker: e.target.value as Broker })}
              >
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
                    value={newStockForm.ticker}
                    onChange={(e) => setNewStockForm({ ...newStockForm, ticker: e.target.value })}
                    placeholder="예: AAPL"
                  />
                </label>
                <label>
                  종목명
                  <input
                    value={newStockForm.name}
                    onChange={(e) => setNewStockForm({ ...newStockForm, name: e.target.value })}
                    placeholder="예: Apple"
                  />
                </label>
              </>
            ) : (
              <label>
                종목 검색 (국내 상장종목)
                <StockSearchInput onSelect={handleStockSelect} />
              </label>
            )}
            {newStockForm.ticker && newStockForm.name && (
              <div className="stock-selected">
                선택됨: <strong>{newStockForm.name}</strong> <span className="muted">({newStockForm.ticker})</span>
              </div>
            )}
            {matchingExistingHolding && (
              <p className="muted small" style={{ gridColumn: '1 / -1', margin: 0 }}>
                ⚠ {matchingExistingHolding.name}({matchingExistingHolding.ticker})은 이미{' '}
                {BROKER_LABELS[matchingExistingHolding.broker]}에 보유 중이에요. 그 종목에 추가 매수를 기록하려면{' '}
                <button
                  type="button"
                  className="link-plain"
                  style={{ display: 'inline', padding: 0 }}
                  onClick={() => {
                    setMode('EXISTING')
                    setForm((f) => ({ ...f, holdingId: matchingExistingHolding.id }))
                  }}
                >
                  기존 보유종목으로 전환
                </button>
                하세요. (다른 증권사에 새로 산 거라면 그대로 진행해도 괜찮아요)
              </p>
            )}
            <button
              type="button"
              className="link-plain"
              onClick={() => {
                setManualEntry((v) => !v)
                setNewStockForm((f) => ({ ...f, ticker: '', name: '' }))
              }}
            >
              {manualEntry ? '종목 검색으로 전환' : '해외주식 등 목록에 없으면 직접 입력'}
            </button>
            <label>
              통화
              <select
                value={newStockForm.currency}
                onChange={(e) => setNewStockForm({ ...newStockForm, currency: e.target.value as 'KRW' | 'USD' })}
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <span className="muted small" style={{ alignSelf: 'end', paddingBottom: 12 }}>
              구분: 매수 (새 종목은 매수만 기록할 수 있어요)
            </span>
          </>
        )}

        <label>
          체결일
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
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
          체결가
          <input
            type="number"
            min="0"
            step="any"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </label>
        <label>
          메모 (선택)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="추가매수 등" />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={submitting || (mode === 'EXISTING' && holdings.length === 0)}
        >
          매매 기록 추가
        </button>
      </form>

      {byHolding.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>종목별 요약 (순매수 기준)</h2>
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th>순매수수량</th>
                <th>순매수금액</th>
                <th>평균 단가</th>
              </tr>
            </thead>
            <tbody>
              {byHolding.map((row) => (
                <tr key={row.holdingId}>
                  <td>{holdingLabel(row.holdingId)}</td>
                  <td>{row.quantity.toLocaleString()}</td>
                  <td>{formatMoney(row.amount, holdingCurrency(row.holdingId))}</td>
                  <td>{formatMoney(row.avgPrice, holdingCurrency(row.holdingId))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {records.length === 0 ? (
        <p className="empty-hint">아직 기록된 매매 이력이 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>체결일</th>
              <th>구분</th>
              <th>종목</th>
              <th>수량</th>
              <th>체결가</th>
              <th>금액</th>
              <th>메모</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...records]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => {
                const currency = holdingCurrency(r.holdingId)
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      <span className={`badge ${r.side === 'SELL' ? 'badge-sell' : 'badge-buy'}`}>
                        {SIDE_LABELS[r.side ?? 'BUY']}
                      </span>
                      {r.note?.startsWith(AUTO_RECORD_NOTE_PREFIX) && (
                        <span className="badge" style={{ marginLeft: 4, background: 'var(--bg)', color: 'var(--muted-strong)' }}>
                          자동
                        </span>
                      )}
                    </td>
                    <td>{holdingLabel(r.holdingId)}</td>
                    <td>{r.quantity.toLocaleString()}</td>
                    <td>{formatMoney(r.price, currency)}</td>
                    <td>{formatMoney(r.quantity * r.price, currency)}</td>
                    <td className="muted">
                      {r.note?.startsWith(AUTO_RECORD_NOTE_PREFIX) ? '적립식 계획 자동 기록 (종가 기준 추정)' : (r.note ?? '—')}
                    </td>
                    <td>
                      <button className="link-danger" onClick={() => handleDelete(r.id)}>
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
