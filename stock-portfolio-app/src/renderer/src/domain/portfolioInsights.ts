/**
 * 홈 화면의 "포트폴리오 한눈 평가" — AI 없이, 미리 정해둔 규칙(집중도·분산도·통화 노출)으로
 * 포트폴리오 상태를 요약한다. 숫자 계산만 하고 문장은 호출부(HomePage)에서 조립한다 —
 * 이 함수는 "그 숫자가 어떤 단계(낮음/보통/높음)에 해당하는지"까지만 순수하게 판단한다.
 */

export type Level = 'LOW' | 'MEDIUM' | 'HIGH'

export interface HoldingShare {
  holdingId: string
  name: string
  /** 통화를 하나로 환산한 값(보통 KRW) */
  valueKrw: number
}

export interface PortfolioInsights {
  holdingCount: number
  topHolding: { name: string; sharePercent: number } | null
  /** 1위 종목 비중이 얼마나 높은지 — 50%↑ HIGH, 30~50% MEDIUM, 그 아래 LOW */
  concentrationLevel: Level
  /** 종목 수가 얼마나 적은지 — 3개 미만 LOW, 3~7개 MEDIUM, 8개↑ HIGH */
  diversificationLevel: Level
  /** 통화별 비중(%). 값이 다 0이거나 총합이 0이면 빈 객체 */
  currencySharePercent: Record<string, number>
}

const CONCENTRATION_HIGH_THRESHOLD = 50
const CONCENTRATION_MEDIUM_THRESHOLD = 30
const DIVERSIFICATION_HIGH_COUNT = 8
const DIVERSIFICATION_MEDIUM_COUNT = 3

function concentrationLevelFor(sharePercent: number): Level {
  if (sharePercent >= CONCENTRATION_HIGH_THRESHOLD) return 'HIGH'
  if (sharePercent >= CONCENTRATION_MEDIUM_THRESHOLD) return 'MEDIUM'
  return 'LOW'
}

function diversificationLevelFor(holdingCount: number): Level {
  if (holdingCount >= DIVERSIFICATION_HIGH_COUNT) return 'HIGH'
  if (holdingCount >= DIVERSIFICATION_MEDIUM_COUNT) return 'MEDIUM'
  return 'LOW'
}

export function evaluatePortfolioInsights(
  shares: HoldingShare[],
  currencyValuesKrw: Record<string, number>
): PortfolioInsights {
  const totalValue = shares.reduce((sum, s) => sum + s.valueKrw, 0)
  const sorted = [...shares].sort((a, b) => b.valueKrw - a.valueKrw)
  const top = sorted[0]
  const topSharePercent = top && totalValue > 0 ? (top.valueKrw / totalValue) * 100 : 0

  const currencyTotal = Object.values(currencyValuesKrw).reduce((sum, v) => sum + v, 0)
  const currencySharePercent: Record<string, number> = {}
  if (currencyTotal > 0) {
    for (const [currency, value] of Object.entries(currencyValuesKrw)) {
      currencySharePercent[currency] = (value / currencyTotal) * 100
    }
  }

  return {
    holdingCount: shares.length,
    topHolding: top ? { name: top.name, sharePercent: topSharePercent } : null,
    concentrationLevel: concentrationLevelFor(topSharePercent),
    diversificationLevel: diversificationLevelFor(shares.length),
    currencySharePercent
  }
}
