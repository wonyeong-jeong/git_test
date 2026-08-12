import { describe, expect, it } from 'vitest'
import { buildCostBasisTimeline, mergeCostBasisAndSnapshots } from './assetGrowth'

describe('buildCostBasisTimeline', () => {
  it('날짜순으로 누적한다', () => {
    const timeline = buildCostBasisTimeline([
      { date: '2026-02-01', amount: 500_000 },
      { date: '2026-01-01', amount: 1_000_000 },
      { date: '2026-03-01', amount: -200_000 } // 매도로 원금 감소
    ])
    expect(timeline).toEqual([
      { date: '2026-01-01', cumulativeCost: 1_000_000 },
      { date: '2026-02-01', cumulativeCost: 1_500_000 },
      { date: '2026-03-01', cumulativeCost: 1_300_000 }
    ])
  })

  it('같은 날짜는 하나의 포인트로 합친다', () => {
    const timeline = buildCostBasisTimeline([
      { date: '2026-01-01', amount: 1_000_000 },
      { date: '2026-01-01', amount: 200_000 }
    ])
    expect(timeline).toEqual([{ date: '2026-01-01', cumulativeCost: 1_200_000 }])
  })

  it('빈 배열이면 빈 결과', () => {
    expect(buildCostBasisTimeline([])).toEqual([])
  })
})

describe('mergeCostBasisAndSnapshots', () => {
  it('원금은 계단식으로 이어지고 스냅샷은 해당 날짜에만 값이 있다', () => {
    const costBasis = [
      { date: '2026-01-01', cumulativeCost: 1_000_000 },
      { date: '2026-01-15', cumulativeCost: 1_500_000 }
    ]
    const snapshots = [
      { date: '2026-01-10', value: 1_100_000 },
      { date: '2026-01-20', value: 1_600_000 }
    ]
    const merged = mergeCostBasisAndSnapshots(costBasis, snapshots)
    expect(merged).toEqual([
      { date: '2026-01-01', cumulativeCost: 1_000_000, snapshotValue: undefined },
      { date: '2026-01-10', cumulativeCost: 1_000_000, snapshotValue: 1_100_000 },
      { date: '2026-01-15', cumulativeCost: 1_500_000, snapshotValue: undefined },
      { date: '2026-01-20', cumulativeCost: 1_500_000, snapshotValue: 1_600_000 }
    ])
  })

  it('스냅샷보다 이전에 원금 기록이 없으면 cumulativeCost는 undefined', () => {
    const merged = mergeCostBasisAndSnapshots([], [{ date: '2026-01-05', value: 500_000 }])
    expect(merged).toEqual([{ date: '2026-01-05', cumulativeCost: undefined, snapshotValue: 500_000 }])
  })

  it('둘 다 비어있으면 빈 결과', () => {
    expect(mergeCostBasisAndSnapshots([], [])).toEqual([])
  })
})
