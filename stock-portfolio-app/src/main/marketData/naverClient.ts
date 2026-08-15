/**
 * 시장 지수(코스피/나스닥 등)와 환율(USD/KRW 등) — 네이버 금융의 공개 데이터를 그대로 쓴다.
 * 로그인이나 API 키 없이 접근 가능한 공개 데이터라 credentialStore 같은 인증 계층이 필요
 * 없다. 별도 API 키가 필요한 토스증권 시세(broker/tossClient.ts)와는 다른 데이터 출처이고,
 * 종목 개별 시세가 아니라 시장 전체 지수/환율만 다룬다는 점에서도 역할이 분리된다.
 *
 * 비공식 엔드포인트라 네이버가 응답 구조를 바꾸면 깨질 수 있다 — 그럴 땐 이 파일만 고치면
 * IPC 핸들러나 렌더러 쪽은 그대로 두고 대응할 수 있도록 파싱을 이 안에 가둬뒀다.
 */

const INDEX_URL = 'https://api.stock.naver.com/index/major'
const FX_URL = 'https://api.stock.naver.com/marketindex/exchange/majors'

const REQUEST_HEADERS = { 'User-Agent': 'Mozilla/5.0' }

export interface IndexQuote {
  code: string
  name: string
  price: number
  changeAmount: number
  changeRatio: number
}

export interface FxRate {
  code: string
  name: string
  /** 외화 1단위 = rate 원 */
  rate: number
  changeAmount: number
  changeRatio: number
}

/** "6,977.94", "-107.58" 같은 콤마 포함 문자열을 숫자로. 부호는 이미 값에 포함되어 있다 */
function parseSignedNumber(s: string): number {
  return Number(s.replace(/,/g, ''))
}

interface RawIndexItem {
  reutersCode?: string
  indexName: string
  closePrice: string
  compareToPreviousClosePrice: string
  fluctuationsRatio: string
}

export async function getMajorIndices(): Promise<IndexQuote[]> {
  const res = await fetch(INDEX_URL, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`지수 조회 실패 (${res.status})`)
  const data = (await res.json()) as RawIndexItem[]
  return data.map((d) => ({
    code: d.reutersCode || d.indexName,
    name: d.indexName,
    price: parseSignedNumber(d.closePrice),
    changeAmount: parseSignedNumber(d.compareToPreviousClosePrice),
    changeRatio: parseSignedNumber(d.fluctuationsRatio)
  }))
}

interface RawFxItem {
  reutersCode: string
  name: string
  closePrice: string
  fluctuations: string
  fluctuationsRatio: string
}

export async function getFxRates(): Promise<FxRate[]> {
  const res = await fetch(FX_URL, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`환율 조회 실패 (${res.status})`)
  const data = (await res.json()) as RawFxItem[]
  return data.map((d) => ({
    code: d.reutersCode,
    name: d.name,
    rate: parseSignedNumber(d.closePrice),
    changeAmount: parseSignedNumber(d.fluctuations),
    changeRatio: parseSignedNumber(d.fluctuationsRatio)
  }))
}
