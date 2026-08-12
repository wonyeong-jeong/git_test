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

export interface ManualPurchase {
  id: string
  profileId: string
  holdingId: string
  date: string
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
