/**
 * 세금/수수료 계산 — 순수 함수, 다른 domain 모듈과 마찬가지로 UI/DB에 의존하지 않는다.
 *
 * 중요한 전제(가정)들 — 세율은 법 개정으로 바뀔 수 있으므로 하드코딩하지 않고
 * TaxAssumptions로 노출해서 UI에서 조정 가능하게 한다:
 *
 * - 국내 상장주식 매매차익: "소액주주" 기준으로 비과세라고 가정한다(대주주 과세는 범위 밖).
 *   실제로 대주주 요건(지분율/보유금액 기준)에 해당하면 이 가정이 틀리므로 UI에 고지 필요.
 * - 해외주식 양도소득세: 기본 22%(지방소득세 포함), 연 250만원 기본공제.
 * - 배당소득세: 기본 15.4%(지방소득세 포함) 분리과세로 가정. 금융소득종합과세
 *   대상(연 2천만원 초과)인 경우 실제 세율이 다를 수 있음 — 범위 밖.
 * - 환전수수료: 증권사/환율우대에 따라 다르므로 기본값만 제공하고 조정 가능하게 한다.
 *
 * 이 모듈은 "지금 다 팔면 세후로 얼마 남는가"를 추정하는 용도이지, 실제 세무 신고를
 * 대체하지 않는다.
 */

export type Market = 'DOMESTIC' | 'OVERSEAS'

export interface TaxAssumptions {
  domesticCapitalGainsTaxExempt: boolean
  overseasCapitalGainsTaxRatePercent: number
  overseasCapitalGainsBasicDeductionKRW: number
  dividendTaxRatePercent: number
  fxConversionFeeRatePercent: number
}

export const DEFAULT_TAX_ASSUMPTIONS: TaxAssumptions = {
  domesticCapitalGainsTaxExempt: true,
  overseasCapitalGainsTaxRatePercent: 22,
  overseasCapitalGainsBasicDeductionKRW: 2_500_000,
  dividendTaxRatePercent: 15.4,
  fxConversionFeeRatePercent: 1
}

export interface CapitalGainsInput {
  market: Market
  totalContributed: number // 총 투입원금(매입금액)
  projectedValue: number // 매도를 가정한 평가금액
  assumptions?: Partial<TaxAssumptions>
}

export interface CapitalGainsResult {
  grossProfit: number
  taxableProfit: number
  taxAmount: number
  netProfit: number
  netValue: number // 세후 실수령 평가금액
  effectiveTaxRatePercent: number
}

export function calculateCapitalGainsTax(input: CapitalGainsInput): CapitalGainsResult {
  const a: TaxAssumptions = { ...DEFAULT_TAX_ASSUMPTIONS, ...input.assumptions }
  const grossProfit = input.projectedValue - input.totalContributed

  const noTax = (): CapitalGainsResult => ({
    grossProfit,
    taxableProfit: 0,
    taxAmount: 0,
    netProfit: grossProfit,
    netValue: input.projectedValue,
    effectiveTaxRatePercent: 0
  })

  if (grossProfit <= 0) return noTax()
  if (input.market === 'DOMESTIC' && a.domesticCapitalGainsTaxExempt) return noTax()
  if (input.market === 'DOMESTIC') return noTax() // 대주주 과세는 아직 미지원 — 비과세로 취급

  const taxableProfit = Math.max(grossProfit - a.overseasCapitalGainsBasicDeductionKRW, 0)
  const taxAmount = taxableProfit * (a.overseasCapitalGainsTaxRatePercent / 100)
  const netProfit = grossProfit - taxAmount

  return {
    grossProfit,
    taxableProfit,
    taxAmount,
    netProfit,
    netValue: input.totalContributed + netProfit,
    effectiveTaxRatePercent: (taxAmount / grossProfit) * 100
  }
}

export interface DividendTaxResult {
  grossDividend: number
  taxAmount: number
  netDividend: number
}

export function calculateDividendTax(
  grossDividend: number,
  assumptions?: Partial<TaxAssumptions>
): DividendTaxResult {
  const a: TaxAssumptions = { ...DEFAULT_TAX_ASSUMPTIONS, ...assumptions }
  const taxAmount = grossDividend * (a.dividendTaxRatePercent / 100)
  return { grossDividend, taxAmount, netDividend: grossDividend - taxAmount }
}

export interface FxConversionResult {
  grossAmount: number
  feeAmount: number
  netAmount: number
}

export function applyFxConversionFee(
  krwAmount: number,
  assumptions?: Partial<TaxAssumptions>
): FxConversionResult {
  const a: TaxAssumptions = { ...DEFAULT_TAX_ASSUMPTIONS, ...assumptions }
  const feeAmount = krwAmount * (a.fxConversionFeeRatePercent / 100)
  return { grossAmount: krwAmount, feeAmount, netAmount: krwAmount - feeAmount }
}
