export type Broker = 'KIS' | 'KB' | 'TOSS' | 'KAKAOPAY' | 'MANUAL'

export interface Profile {
  id: string
  name: string
  createdAt: string
}

export interface Holding {
  id: string
  profileId: string
  broker: Broker
  ticker: string
  name: string
  quantity: number
  avgPrice: number
  currency: 'KRW' | 'USD'
  createdAt: string
}

export type TradeSide = 'BUY' | 'SELL'

export interface ManualPurchase {
  id: string
  profileId: string
  holdingId: string
  date: string
  /** 예전 기록엔 없을 수 있음 — 읽을 때 store.ts에서 'BUY'로 기본값 처리 */
  side: TradeSide
  quantity: number
  price: number
  note?: string
  createdAt: string
}

export interface WatchlistItem {
  id: string
  profileId: string
  ticker: string
  name: string
  currency: 'KRW' | 'USD'
  createdAt: string
}

export type ContributionFrequency = 'MONTHLY' | 'WEEKLY' | 'DAILY'

/** 회당 적립을 금액으로 정할지, 수량(소수점 매수 포함)으로 정할지 */
export type ContributionValueType = 'AMOUNT' | 'QUANTITY'

export interface ContributionPlan {
  id: string
  profileId: string
  holdingId: string
  ticker: string
  name: string
  frequency: ContributionFrequency
  /** 예전 기록엔 없을 수 있음 — 읽을 때 store.ts에서 'AMOUNT'로 기본값 처리 */
  contributionType: ContributionValueType
  /** contributionType이 'AMOUNT'면 금액(원/달러), 'QUANTITY'면 수량(소수점 가능) */
  amount: number
  dayOfMonth?: number
  startDate: string
  endDate?: string
  assumedAnnualReturnRate: number
  /** 가정 연 배당수익률(%). 배당을 안 주거나 모르면 0 */
  assumedDividendYieldPercent: number
  active: boolean
  createdAt: string
}

export interface DividendRecord {
  id: string
  profileId: string
  holdingId: string
  date: string
  /** 세전 총 수령액 */
  amount: number
  note?: string
  createdAt: string
}

export interface AssetSnapshot {
  id: string
  profileId: string
  /** YYYY-MM-DD, 하루 1개만 유지(같은 날짜면 덮어씀) */
  date: string
  /** 통화별 평가금액. KRW/USD를 섞어 더하지 않기 위해 통화별로 따로 보관한다(환율 미지원) */
  valuesByCurrency: Record<string, number>
  createdAt: string
}

/**
 * 재무 정보(월급/적금/대출) — "목표(20억 모으기 등)를 지금 투자 능력으로 현실적으로 달성할 수
 * 있는가"를 평가하려면 주식 포트폴리오만으로는 부족하다. 매달 얼마를 더 투자에 쓸 수 있는지
 * (월급 - 적금 납입액 - 대출 상환액)와, 지금 순자산이 얼마인지(주식 평가금액 + 예적금 -
 * 대출잔액)가 있어야 계산이 된다. domain/financialGoal.ts가 이 셋을 조합해서 계산한다.
 */
export interface IncomeSource {
  id: string
  profileId: string
  /** 예: "본급여", "부업" */
  name: string
  monthlyAmount: number
  currency: 'KRW' | 'USD'
  note?: string
  createdAt: string
}

export interface SavingsAccount {
  id: string
  profileId: string
  /** 예: "청약저축", "정기적금" */
  name: string
  currentBalance: number
  /** 매달 추가로 넣는 금액(0이면 예치만 하고 추가 납입 없음) */
  monthlyContribution: number
  interestRatePercent: number
  currency: 'KRW' | 'USD'
  createdAt: string
}

export interface Loan {
  id: string
  profileId: string
  /** 예: "전세자금대출", "학자금대출" */
  name: string
  remainingBalance: number
  monthlyPayment: number
  interestRatePercent: number
  currency: 'KRW' | 'USD'
  createdAt: string
}

export interface FinancialGoal {
  id: string
  profileId: string
  /** 예: "45세 전 20억 모으기" */
  name: string
  targetAmount: number
  currency: 'KRW' | 'USD'
  /** 목표 달성 희망일(ISO date) — "나이"가 아니라 날짜로 저장해서, 앱이 이 사람의 생년월일을
   * 별도로 몰라도 "오늘부터 남은 개월수"를 항상 정확히 재계산할 수 있게 한다. */
  targetDate: string
  assumedAnnualReturnRatePercent: number
  createdAt: string
}

export interface ProfileData {
  holdings: Holding[]
  manualPurchases: ManualPurchase[]
  contributionPlans: ContributionPlan[]
  dividendRecords: DividendRecord[]
  watchlist: WatchlistItem[]
  assetSnapshots: AssetSnapshot[]
  incomeSources: IncomeSource[]
  savingsAccounts: SavingsAccount[]
  loans: Loan[]
  financialGoals: FinancialGoal[]
}
