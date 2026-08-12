import { loadCredentials } from './credentialStore'

/**
 * 토스증권 Open API 클라이언트.
 *
 * ⚠️ 중요한 설계 원칙: 이 파일은 Market Data(시세) 엔드포인트만 호출한다.
 * Account & Asset / Order API는 인증에 `X-Tossinvest-Account` 헤더가 별도로 필요한데,
 * 그 헤더를 다루는 코드를 의도적으로 만들지 않는다 — 매수/매도/보유종목 조회를
 * 구조적으로 이 앱에서 아예 할 수 없게 막기 위함이다. 이 원칙을 깨는 변경(계좌/주문
 * 엔드포인트 호출 추가)은 반드시 사용자와 먼저 상의할 것.
 */

const TOKEN_URL = 'https://openapi.tossinvest.com/oauth2/token'
const PRICES_URL = 'https://openapi.tossinvest.com/api/v1/prices'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface CachedToken {
  value: string
  expiresAt: number
}

let cachedToken: CachedToken | null = null

/** 테스트에서 캐시를 초기화하기 위한 용도 */
export function _resetTokenCacheForTests(): void {
  cachedToken = null
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }

  const creds = loadCredentials()
  if (!creds) {
    throw new Error('토스증권 API 키가 등록되어 있지 않습니다. 설정에서 먼저 연결해주세요.')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`토큰 발급 실패 (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TokenResponse
  const safetyMarginMs = 60_000 // 만료 임박 전에 미리 갱신
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(data.expires_in * 1000 - safetyMarginMs, 0)
  }
  return cachedToken.value
}

export interface Quote {
  symbol: string
  lastPrice: number
  currency: string
  timestamp: string
}

interface PricesResponse {
  result: Array<{ symbol: string; lastPrice: string; currency: string; timestamp: string }>
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const uniqueSymbols = [...new Set(symbols)].filter(Boolean)
  if (uniqueSymbols.length === 0) return []

  const token = await getAccessToken()
  const url = `${PRICES_URL}?symbols=${encodeURIComponent(uniqueSymbols.join(','))}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`시세 조회 실패 (${res.status}): ${text}`)
  }

  const data = (await res.json()) as PricesResponse
  return data.result.map((r) => ({
    symbol: r.symbol,
    lastPrice: Number(r.lastPrice),
    currency: r.currency,
    timestamp: r.timestamp
  }))
}
