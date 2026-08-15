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

export interface QuantityContributionInput {
  /** 현재까지 모인 원금(이미 투자된 금액) */
  initialPrincipal: number
  /** 회당 매수 수량 (소수점 매수 가능) */
  quantityPerContribution: number
  /** 회당 매수 시점 기준으로 삼을 주가 (보통 현재가, 없으면 평단가) */
  referencePrice: number
  /** 가정 연 수익률 (%) — 매수 기준가도 이 비율로 함께 성장한다고 가정한다 */
  annualReturnRatePercent: number
  months: number
}

/**
 * "매월 X주씩 산다"는 계획의 복리 시뮬레이션. projectContributionGrowth와 달리 회당 투입
 * 금액이 고정이 아니라, 가정 수익률만큼 주가도 함께 오른다고 보고 매달 재계산한다 — 그래서
 * 시간이 지날수록 회당 투입 금액이 커진다. (반대로 금액 고정 방식은 시간이 지날수록 매수
 * 수량이 줄어드는 효과가 있는데, 이건 그 반대 시나리오다.)
 */
export function projectQuantityContributionGrowth(input: QuantityContributionInput): CompoundProjectionPoint[] {
  const { initialPrincipal, quantityPerContribution, referencePrice, annualReturnRatePercent, months } = input
  const r = monthlyRateFromAnnualPercent(annualReturnRatePercent)

  const points: CompoundProjectionPoint[] = [
    { month: 0, contributed: initialPrincipal, value: initialPrincipal }
  ]

  let value = initialPrincipal
  let contributed = initialPrincipal
  let estimatedPrice = referencePrice

  for (let m = 1; m <= months; m++) {
    const contribution = quantityPerContribution * estimatedPrice
    value = (value + contribution) * (1 + r)
    contributed += contribution
    estimatedPrice *= 1 + r
    points.push({ month: m, contributed, value })
  }

  return points
}

export type ContributionFrequency = 'MONTHLY' | 'WEEKLY'

/**
 * 이 모듈의 복리 계산은 전부 "월" 단위로만 굴러간다(annualReturnRatePercent를 월率로 쪼개서
 * 매달 한 번씩 적립+성장을 반복). WEEKLY 적립은 한 달에 정확히 4번이 아니라 평균
 * 365.2425일 / 7일 / 12개월 ≈ 4.348번 들어온다 — 이 계수 없이 "회당 값"을 그대로 월간
 * 값으로 쓰면 실제 적립 속도를 4배 넘게 과소평가하게 된다(예: 매주 1주씩 사는 계획을
 * 매달 1주씩 사는 것처럼 계산해버림). 그래서 회당 값에 이 배수를 곱해 "월 환산 값"으로
 * 바꾼 뒤에만 projectContributionGrowth/projectQuantityContributionGrowth에 넘긴다.
 */
export function monthlyEquivalentMultiplier(frequency: ContributionFrequency): number {
  return frequency === 'WEEKLY' ? 365.2425 / 7 / 12 : 1
}

export interface PlanContributionInput {
  contributionType: 'AMOUNT' | 'QUANTITY'
  frequency: ContributionFrequency
  /** contributionType이 'AMOUNT'면 회당 금액, 'QUANTITY'면 회당 수량 (frequency 단위 그대로, 월 환산은 이 함수가 처리) */
  value: number
  /** contributionType이 'QUANTITY'일 때만 쓰임 — 수량을 금액으로 환산할 기준가 */
  referencePrice?: number
  initialPrincipal: number
  annualReturnRatePercent: number
  months: number
}

/**
 * 적립식 계획(ContributionPlan)의 contributionType·frequency에 따라 금액 기준/수량 기준
 * 시뮬레이션 중 알맞은 쪽으로 자동 분기하고, WEEKLY 적립이면 월 환산까지 처리하는 단일
 * 진입점. 페이지마다 이 분기·환산 로직을 반복해서 만들지 않으려고 여기 하나로 모았다.
 */
export function projectPlanContributionGrowth(input: PlanContributionInput): CompoundProjectionPoint[] {
  const { contributionType, frequency, value, referencePrice, initialPrincipal, annualReturnRatePercent, months } = input
  const monthlyValue = value * monthlyEquivalentMultiplier(frequency)

  if (contributionType === 'QUANTITY') {
    return projectQuantityContributionGrowth({
      initialPrincipal,
      quantityPerContribution: monthlyValue,
      referencePrice: referencePrice ?? 0,
      annualReturnRatePercent,
      months
    })
  }
  return projectContributionGrowth({
    initialPrincipal,
    monthlyContribution: monthlyValue,
    annualReturnRatePercent,
    months
  })
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
