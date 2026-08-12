/**
 * 순수 복리 계산 엔진. Electron/DB에 대한 의존성이 전혀 없어 단위테스트로 검증 가능하고,
 * 데이터 출처(수동입력이든 나중에 증권사 API든)에 관계없이 재사용된다.
 *
 * 가정: 매월 초에 적립금을 넣고(annuity-due), 그 달의 수익률만큼 전체 잔액이 성장한다.
 */

export interface CompoundProjectionInput {
  /** 현재까지 모인 원금(이미 투자된 금액) */
  initialPrincipal: number
  /** 매월 적립액. 적립을 더 안 하는 시나리오는 0 */
  monthlyContribution: number
  /** 가정 연 수익률 (%, 예: 7은 연 7%) */
  annualReturnRatePercent: number
  /** 시뮬레이션할 개월 수 */
  months: number
}

export interface CompoundProjectionPoint {
  month: number
  /** 누적 납입 원금 (초기 원금 + 그동안 넣은 적립금 합계) */
  contributed: number
  /** 그 시점의 평가금액 (원금 + 복리 수익) */
  value: number
}

export function monthlyRateFromAnnualPercent(annualReturnRatePercent: number): number {
  return annualReturnRatePercent / 100 / 12
}

export function projectContributionGrowth(
  input: CompoundProjectionInput
): CompoundProjectionPoint[] {
  const { initialPrincipal, monthlyContribution, annualReturnRatePercent, months } = input
  const r = monthlyRateFromAnnualPercent(annualReturnRatePercent)

  const points: CompoundProjectionPoint[] = [
    { month: 0, contributed: initialPrincipal, value: initialPrincipal }
  ]

  let value = initialPrincipal
  let contributed = initialPrincipal

  for (let m = 1; m <= months; m++) {
    value = (value + monthlyContribution) * (1 + r)
    contributed += monthlyContribution
    points.push({ month: m, contributed, value })
  }

  return points
}

/**
 * 여러 종목(적립식 계획)의 개별 복리 곡선을 월 단위로 합산한다 (목표4: 종목 합산 시뮬레이션).
 * 수익률이 종목마다 다르면 평균을 낼 수 없으므로, 반드시 각자 따로 projectContributionGrowth로
 * 계산한 뒤 이 함수로 합쳐야 한다. 입력 배열의 각 프로젝션은 같은 months로 계산되어 있어야 한다.
 */
export function aggregateProjections(projections: CompoundProjectionPoint[][]): CompoundProjectionPoint[] {
  if (projections.length === 0) return []
  const months = Math.max(...projections.map((p) => p.length))
  const result: CompoundProjectionPoint[] = []
  for (let m = 0; m < months; m++) {
    let contributed = 0
    let value = 0
    for (const proj of projections) {
      const point = proj[m] ?? proj[proj.length - 1]
      if (point) {
        contributed += point.contributed
        value += point.value
      }
    }
    result.push({ month: m, contributed, value })
  }
  return result
}

export interface ExpectedReturnSummary {
  totalContributed: number
  finalValue: number
  expectedProfit: number
  /** 총 납입원금 대비 수익률 (%) */
  expectedReturnRatePercent: number
}

export function summarizeExpectedReturn(points: CompoundProjectionPoint[]): ExpectedReturnSummary {
  const last = points[points.length - 1]
  const expectedProfit = last.value - last.contributed
  const expectedReturnRatePercent =
    last.contributed === 0 ? 0 : (expectedProfit / last.contributed) * 100
  return {
    totalContributed: last.contributed,
    finalValue: last.value,
    expectedProfit,
    expectedReturnRatePercent
  }
}
