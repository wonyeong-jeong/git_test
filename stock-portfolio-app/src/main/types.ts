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

export type ContributionFrequency = 'MONTHLY' | 'WEEKLY'

export interface ContributionPlan {
  id: string
  profileId: string
  holdingId: string
  ticker: string
  name: string
  frequency: ContributionFrequency
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

export interface ProfileData {
  holdings: Holding[]
  manualPurchases: ManualPurchase[]
  contributionPlans: ContributionPlan[]
  dividendRecords: DividendRecord[]
  watchlist: WatchlistItem[]
  assetSnapshots: AssetSnapshot[]
}
