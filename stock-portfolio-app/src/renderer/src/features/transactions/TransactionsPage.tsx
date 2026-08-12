import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Holding, ManualPurchase } from '../../types'

interface Props {
  profileId: string
  holdings: Holding[]
}

const emptyForm = {
  holdingId: '',
  date: new Date().toISOString().slice(0, 10),
  quantity: '',
  price: '',
  note: ''
}

export default function TransactionsPage({ profileId, holdings }: Props): JSX.Element {
  const [records, setRecords] = useState<ManualPurchase[]>([])
  const [form, setForm] = useState(emptyForm)

  async function refresh(): Promise<void> {
    setRecords(await window.api.manualPurchases.list(profileId))
  }

  useEffect(() => {
    refresh()
  }, [profileId])

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.holdingId || !form.quantity || !form.price) return
    await window.api.manualPurchases.create(profileId, {
      holdingId: form.holdingId,
      date: form.date,
      quantity: Number(form.quantity),
      price: Number(form.price),
      note: form.note || undefined
    })
    setForm(emptyForm)
    refresh()
  }

  async function handleDelete(id: string): Promise<void> {
    await window.api.manualPurchases.delete(profileId, id)
    refresh()
  }

  function holdingLabel(holdingId: string): string {
    const h = holdings.find((x) => x.id === holdingId)
    return h ? `${h.name} (${h.ticker})` : '(삭제된 종목)'
  }

  const byHolding = useMemo(() => {
    const map = new Map<string, { quantity: number; amount: number }>()
    for (const r of records) {
      const cur = map.get(r.holdingId) ?? { quantity: 0, amount: 0 }
      cur.quantity += r.quantity
      cur.amount += r.quantity * r.price
      map.set(r.holdingId, cur)
    }
    return [...map.entries()].map(([holdingId, v]) => ({
      holdingId,
      quantity: v.quantity,
      amount: v.amount,
      avgPrice: v.quantity === 0 ? 0 : v.amount / v.quantity
    }))
  }, [records])

  const totalAmount = records.reduce((sum, r) => sum + r.quantity * r.price, 0)

  return (
    <div>
      <div className="page-header">
        <h1>매매 이력</h1>
        <div className="summary-pill">기록된 총 매수금액 {Math.round(totalAmount).toLocaleString()}원</div>
      </div>

      <p className="muted small" style={{ marginTop: -8, marginBottom: 20 }}>
        이 앱은 실제 주문을 넣지 않습니다. 증권사 앱에서 직접 매수/매도한 뒤, 그 체결 내역을 여기에 기록해서 이력을
        관리하는 용도입니다.
      </p>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          종목
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
        <button type="submit" className="primary" disabled={holdings.length === 0}>
          매매 기록 추가
        </button>
      </form>

      {byHolding.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>종목별 요약</h2>
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th>기록된 매수수량</th>
                <th>기록된 매수금액</th>
                <th>평균 매수가</th>
              </tr>
            </thead>
            <tbody>
              {byHolding.map((row) => (
                <tr key={row.holdingId}>
                  <td>{holdingLabel(row.holdingId)}</td>
                  <td>{row.quantity.toLocaleString()}</td>
                  <td>{Math.round(row.amount).toLocaleString()}원</td>
                  <td>{Math.round(row.avgPrice).toLocaleString()}원</td>
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
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{holdingLabel(r.holdingId)}</td>
                  <td>{r.quantity.toLocaleString()}</td>
                  <td>{r.price.toLocaleString()}원</td>
                  <td>{Math.round(r.quantity * r.price).toLocaleString()}원</td>
                  <td className="muted">{r.note ?? '—'}</td>
                  <td>
                    <button className="link-danger" onClick={() => handleDelete(r.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
