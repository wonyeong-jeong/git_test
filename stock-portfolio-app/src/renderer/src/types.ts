export type Broker = 'KIS' | 'KB' | 'TOSS' | 'KAKAOPAY' | 'MANUAL'

export const BROKER_LABELS: Record<Broker, string> = {
  KIS: '한국투자증권',
  KB: 'KB증권',
  TOSS: '토스증권',
  KAKAOPAY: '카카오페이증권',
  MANUAL: '기타/직접입력'
}

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

export type ContributionFrequency = 'MONTHLY' | 'WEEKLY'

/** 회당 적립을 금액으로 정할지, 수량(소수점 매수 포함)으로 정할지 */
export type ContributionValueType = 'AMOUNT' | 'QUANTITY'

export interface ContributionPlan {
  id: string
  profileId: string
  holdingId: string
  ticker: string
  name: string
  frequency: ContributionFrequency
  /** 예전 기록엔 없을 수 있음 — main 프로세스 store.ts에서 읽을 때 'AMOUNT'로 기본값 처리됨 */
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

export type TradeSide = 'BUY' | 'SELL'

export interface ManualPurchase {
  id: string
  profileId: string
  holdingId: string
  date: string
  /** 예전 기록엔 없을 수 있음 — main 프로세스 store.ts에서 읽을 때 'BUY'로 기본값 처리됨 */
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

export interface Quote {
  symbol: string
  lastPrice: number
  currency: string
  timestamp: string
}

export interface AssetSnapshot {
  id: string
  profileId: string
  /** YYYY-MM-DD */
  date: string
  /** 통화별 평가금액. KRW/USD를 섞어 더하지 않기 위해 통화별로 따로 보관한다(환율 미지원) */
  valuesByCurrency: Record<string, number>
  createdAt: string
}
