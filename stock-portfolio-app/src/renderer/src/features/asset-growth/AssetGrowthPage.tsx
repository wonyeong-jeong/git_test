import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AssetSnapshot, Holding, ManualPurchase } from '../../types'
import { buildCumulativeTimeline, mergeCostBasisAndSnapshots, type CumulativeDelta } from '../../domain/assetGrowth'
import { deriveCurrentPosition } from '../../domain/position'

interface Props {
  profileId: string
  holdings: Holding[]
}

/** 통화가 섞이면 그래프에서 더할 수 없으므로(환율 미지원) 통화별로 카드를 나눠서 보여준다 */
export default function AssetGrowthPage({ profileId, holdings }: Props): JSX.Element {
  const [purchases, setPurchases] = useState<ManualPurchase[]>([])
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([])
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    window.api.manualPurchases.list(profileId).then(setPurchases)
    window.api.assetSnapshots.list(profileId).then(setSnapshots)
  }, [profileId])

  // 이 화면을 열 때마다 "오늘"의 평가금액 스냅샷을 한 번 기록한다. 시세 조회가 실패해도
  // (자격증명 미등록 등) 평단가 기준으로라도 기록해서 원금 추이만큼은 항상 남긴다.
  useEffect(() => {
    if (holdings.length === 0) return

    let cancelled = false
    async function recordSnapshot(): Promise<void> {
      setRecording(true)
      let quoteByTicker = new Map<string, number>()
      try {
        const quotes = await window.api.broker.getQuotes(holdings.map((h) => h.ticker))
        quoteByTicker = new Map(quotes.map((q) => [q.symbol, q.lastPrice]))
      } catch {
        // 시세 조회 실패는 조용히 무시하고 평단가로 대체 — 이 화면의 핵심은 "기록을 남기는 것"이지
        // 실시간 시세 자체가 아니다(그건 보유종목 페이지의 역할).
      }

      // Holding.quantity/avgPrice는 등록 시점 값 그대로라, '매매 이력'에 기록된 실제 매수/매도까지
      // 반영한 진짜 현재 수량을 다시 계산해서 평가금액을 구한다. 시세를 못 가져온 종목은 그
      // 평단가를 대신 쓴다(정확한 현재가는 아니지만 원금 추이만큼은 항상 남기기 위함).
      const valuesByCurrency: Record<string, number> = {}
      for (const h of holdings) {
        const position = deriveCurrentPosition(
          h,
          purchases.filter((p) => p.holdingId === h.id)
        )
        const price = quoteByTicker.get(h.ticker) ?? position.avgPrice
        valuesByCurrency[h.currency] = (valuesByCurrency[h.currency] ?? 0) + position.quantity * price
      }

      const snapshot = await window.api.assetSnapshots.record(profileId, valuesByCurrency)
      if (cancelled) return
      setSnapshots((prev) => {
        const withoutToday = prev.filter((s) => s.id !== snapshot.id)
        return [...withoutToday, snapshot]
      })
      setRecording(false)
    }

    recordSnapshot()
    return () => {
      cancelled = true
    }
    // holdings/purchases는 참조가 자주 바뀔 수 있어 개수만 의존성으로 둔다 (스냅샷은 하루
    // 1번이면 충분). purchases.length를 넣어둔 건 최초 마운트 시 매매 이력이 아직 로딩 전이라
    // 반영 안 된 채로 기록되는 걸 막기 위함 — 로딩 완료 후 한 번 더 정확히 다시 기록된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, holdings.length, purchases.length])

  const currencies = [...new Set(holdings.map((h) => h.currency))]

  const holdingsById = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings])

  function chartDataFor(currency: string): ReturnType<typeof mergeCostBasisAndSnapshots> {
    const deltas: CumulativeDelta[] = [
      ...holdings
        .filter((h) => h.currency === currency)
        .map((h) => ({ date: h.createdAt.slice(0, 10), amount: h.quantity * h.avgPrice })),
      ...purchases
        .filter((p) => holdingsById.get(p.holdingId)?.currency === currency)
        .map((p) => ({ date: p.date, amount: (p.side === 'SELL' ? -1 : 1) * p.quantity * p.price }))
    ]
    const costBasis = buildCumulativeTimeline(deltas)
    const snapshotPoints = snapshots
      .filter((s) => s.valuesByCurrency[currency] != null)
      .map((s) => ({ date: s.date, value: s.valuesByCurrency[currency] }))
    return mergeCostBasisAndSnapshots(costBasis, snapshotPoints)
  }

  return (
    <div>
      <div className="page-header">
        <h1>자산 증식 그래프</h1>
        {recording && <span className="summary-pill">오늘 평가금액 기록 중…</span>}
      </div>

      <p className="muted small" style={{ marginTop: -8, marginBottom: 20 }}>
        과거 시세 데이터가 없어서 평가금액의 소급 적용은 불가능합니다. <strong>누적 투입원금</strong>은 보유종목
        등록일·매수/매도 기록으로 계산되는 실제 히스토리이고, <strong>평가금액</strong>은 이 화면을 열 때마다 하루
        1번씩 기록해서 오늘부터 쌓입니다. 통화가 섞이면 더할 수 없어서(환율 미지원) 통화별로 그래프를 나눴습니다.
      </p>

      {holdings.length === 0 ? (
        <p className="empty-hint">보유 종목이 없어서 자산 추이를 계산할 수 없어요. 먼저 '보유 종목'을 등록해주세요.</p>
      ) : (
        currencies.map((currency) => {
          const data = chartDataFor(currency)
          const latest = data[data.length - 1]
          return (
            <div key={currency} className="card">
              <h2 style={{ marginTop: 0, fontSize: 15 }}>{currency} 자산 추이</h2>

              <div className="summary-cards">
                <div className="summary-card">
                  <span className="label">누적 투입원금</span>
                  <span className="value">
                    {latest?.cumulativeCost != null ? Math.round(latest.cumulativeCost).toLocaleString() : '—'} {currency}
                  </span>
                </div>
                <div className="summary-card highlight">
                  <span className="label">최근 기록된 평가금액</span>
                  <span className="value">
                    {(() => {
                      const lastSnapshot = [...data].reverse().find((p) => p.snapshotValue != null)
                      return lastSnapshot ? `${Math.round(lastSnapshot.snapshotValue!).toLocaleString()} ${currency}` : '아직 없음'
                    })()}
                  </span>
                </div>
              </div>

              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip formatter={(v: number) => `${Math.round(v).toLocaleString()} ${currency}`} />
                    <Legend />
                    <Line
                      type="stepAfter"
                      dataKey="cumulativeCost"
                      name="누적 투입원금"
                      stroke="#ADB5BD"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="snapshotValue"
                      name="평가금액 (오늘부터 기록)"
                      stroke="#3182F6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
