/**
 * "28세, 45세 전까지 20억을 모으고 싶다 — 현재 투자능력으로 현실 가능한가?" 를 계산하는
 * 순수 함수들. 주식 포트폴리오의 복리 계산(compound.ts)을 그대로 재사용한다 — 목표 달성
 * 시뮬레이션도 결국 "지금 순자산(원금) + 매달 얼마씩(적립) + 가정 수익률로 몇 개월 굴리기"와
 * 똑같은 구조라서, 새 복리 엔진을 또 만들 필요가 없다.
 */

import { monthlyRateFromAnnualPercent, projectContributionGrowth, type CompoundProjectionPoint } from './compound'

export interface GoalFeasibilityInput {
  /** 지금 순자산(주식 평가금액 + 예적금 잔액 - 대출 잔액), 목표와 같은 통화 기준 */
  currentNetWorth: number
  /** 매달 추가로 투자에 쓸 수 있는 금액(월급 - 적금 납입액 - 대출 상환액 등) */
  monthlyInvestable: number
  /** 목표일까지 남은 개월 수 */
  months: number
  assumedAnnualReturnRatePercent: number
  targetAmount: number
}

export interface GoalFeasibilityResult {
  /** 지금 페이스(순자산 + 월 투자가능액 + 가정수익률)로 목표일에 도달할 것으로 예상되는 금액 */
  projectedValue: number
  isAchievable: boolean
  /** 목표에 못 미치는 금액. 달성 가능하면 0 */
  shortfall: number
  /** 같은 수익률 가정 하에, 목표 금액에 정확히 맞추려면 매달 필요한 투자액.
   * Infinity면(개월 수가 0이면서 원금만으로 목표에 못 미치는 경우 등) 그 페이스로는 불가능하다는 뜻. */
  requiredMonthlyContribution: number
  points: CompoundProjectionPoint[]
}

/** annuity-due(매달 초 납입 후 그 달 수익률 적용) 미래가치 공식에서 "월 납입액 1원당 늘어나는
 * 미래가치" 배수. compound.ts의 projectContributionGrowth 재귀식
 * `value = (value + M) * (1+r)`을 n번 펼치면 FV = P(1+r)^n + M(1+r)Σ(1+r)^(k-1)(k=1..n)이
 * 되는데, 그 합(Σ) 부분을 등비수열 공식으로 정리한 것. r=0이면 등비수열 공식이 0으로
 * 나누기가 되므로 n으로 대체한다(그냥 M을 n번 더한 것과 같다). */
function futureValueAnnuityDueFactor(monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return months
  return (1 + monthlyRate) * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
}

/** currentNetWorth와 monthlyInvestable 없이, "이 수익률로 이 개월 동안 굴리면 목표액에
 * 정확히 맞추려면 매달 얼마씩 넣어야 하는가"만 역산한다. */
export function requiredMonthlyContribution(
  currentNetWorth: number,
  targetAmount: number,
  months: number,
  assumedAnnualReturnRatePercent: number
): number {
  const r = monthlyRateFromAnnualPercent(assumedAnnualReturnRatePercent)
  const grownPrincipal = currentNetWorth * Math.pow(1 + r, months)
  const factor = futureValueAnnuityDueFactor(r, months)
  if (factor <= 0) return targetAmount > grownPrincipal ? Infinity : 0
  // 원금 성장만으로 이미 목표를 넘어서면 음수가 나올 수 있는데("매달 이만큼 빼도 된다"는
  // 뜻이긴 하지만), "필요한 최소 투자액"이라는 이름에 맞게 0으로 바닥을 둔다.
  return Math.max((targetAmount - grownPrincipal) / factor, 0)
}

export function evaluateGoalFeasibility(input: GoalFeasibilityInput): GoalFeasibilityResult {
  const points = projectContributionGrowth({
    initialPrincipal: input.currentNetWorth,
    monthlyContribution: input.monthlyInvestable,
    annualReturnRatePercent: input.assumedAnnualReturnRatePercent,
    months: input.months
  })
  const projectedValue = points[points.length - 1].value
  const shortfall = Math.max(input.targetAmount - projectedValue, 0)
  return {
    projectedValue,
    isAchievable: projectedValue >= input.targetAmount,
    shortfall,
    requiredMonthlyContribution: requiredMonthlyContribution(
      input.currentNetWorth,
      input.targetAmount,
      input.months,
      input.assumedAnnualReturnRatePercent
    ),
    points
  }
}

/** targetDate까지 오늘부터 남은 개월 수(내림 없이, 날짜 차이를 30.44일 평균으로 환산).
 * 이미 지난 날짜면 0을 반환한다(음수 개월로 시뮬레이션하지 않도록). */
export function monthsUntil(targetDateIso: string, fromDateIso: string): number {
  const from = new Date(fromDateIso + 'T00:00:00')
  const target = new Date(targetDateIso + 'T00:00:00')
  const days = (target.getTime() - from.getTime()) / 86_400_000
  return Math.max(0, Math.round(days / (365.2425 / 12)))
}

export interface MonthlyInvestableInput {
  totalMonthlyIncome: number
  totalMonthlySavingsContribution: number
  totalMonthlyLoanPayment: number
}

/** 월급에서 적금 납입액·대출 상환액을 뺀 "매달 새로 투자에 쓸 수 있는 여유자금". 이미 모아둔
 * 예적금 잔액 자체는 currentNetWorth 쪽에서 다룬다 — 여기서는 흐름(flow)만 계산한다. */
export function computeMonthlyInvestable(input: MonthlyInvestableInput): number {
  return input.totalMonthlyIncome - input.totalMonthlySavingsContribution - input.totalMonthlyLoanPayment
}
