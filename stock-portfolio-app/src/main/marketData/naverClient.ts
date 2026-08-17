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

/**
 * 과거 시세 조회 — "평가금액도 과거로 소급할 수 없는가"라는 요청에 대한 답.
 *
 * 국내(KRX) 종목은 네이버의 옛날식 시세 API(`siseJson.naver`)가 원하는 날짜 범위를 그대로
 * 다 내려준다(상장일까지도 가능) — 그래서 국내 종목은 등록일/매수일부터 정확한 일별 종가를
 * 구할 수 있다.
 *
 * 해외 종목은 이 옛날식 API가 없고, 대신 `api.stock.naver.com/chart/foreign/item/{코드}`를
 * 쓰는데 이건 날짜 범위 파라미터를 무시하고 항상 "오늘부터 최근 110개 캔들"만 돌려준다 — 그래서
 * periodType(일/주/월봉)을 얼마나 먼 과거가 필요한지에 따라 골라서, 그만큼만 확보한다(일봉
 * ≈6개월, 주봉 ≈2년, 월봉 ≈9년). 그보다 더 먼 과거는 이 데이터 출처로는 구할 수 없다 — 이
 * 경우 반환되는 배열이 요청한 시작일보다 늦게 시작할 수 있고, 호출부(historicalValuation)가
 * 그 구간을 조용히 비워두는 방식으로 처리한다.
 *
 * 해외 종목은 티커만으로 바로 조회가 안 되고 네이버 내부 코드(reutersCode, 예: AAPL → AAPL.O)가
 * 필요해서 자동완성 검색으로 먼저 알아낸다(resolveForeignSymbol).
 */
export interface HistoricalPricePoint {
  /** YYYY-MM-DD */
  date: string
  close: number
}

function toIsoDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
}

function toCompactDate(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8)
}

/** siseJson.naver 응답은 JSON이 아니라 JS 배열 리터럴(헤더 행이 홑따옴표라 JSON.parse가 안 됨) —
 * 그래서 eval 대신 정규식으로 데이터 행("YYYYMMDD", 시가, 고가, 저가, 종가, 거래량, 외국인소진율)만
 * 안전하게 뽑아낸다. */
function parseSiseJson(text: string): HistoricalPricePoint[] {
  const rowPattern = /\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(\d+),\s*([-\d.]+)\]/g
  const points: HistoricalPricePoint[] = []
  let match: RegExpExecArray | null
  while ((match = rowPattern.exec(text)) !== null) {
    points.push({ date: toIsoDate(match[1]), close: Number(match[5]) })
  }
  return points
}

export async function getDomesticDailyPrices(code: string, fromDate: string, toDate: string): Promise<HistoricalPricePoint[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(code)}&requestType=1&startTime=${toCompactDate(fromDate)}&endTime=${toCompactDate(toDate)}&timeframe=day`
  const res = await fetch(url, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`국내 종목 과거 시세 조회 실패 (${res.status})`)
  return parseSiseJson(await res.text())
}

interface AutocompleteItem {
  code: string
  reutersCode: string
  nationCode: string
  category: string
}

/** 해외 티커(예: AAPL)를 네이버 내부 코드(예: AAPL.O)로 변환한다. 여러 후보가 나오면 미국 주식을
 * 우선하고, 못 찾으면 null — 호출부는 이걸 "과거 시세를 못 가져온다"로 조용히 처리한다. */
export async function resolveForeignSymbol(ticker: string): Promise<string | null> {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(ticker)}&target=stock`
  const res = await fetch(url, { headers: REQUEST_HEADERS })
  if (!res.ok) return null
  const data = (await res.json()) as { items?: AutocompleteItem[] }
  const items = data.items ?? []
  const exact = items.filter((i) => i.code.toUpperCase() === ticker.toUpperCase())
  const best = exact.find((i) => i.nationCode === 'USA') ?? exact[0] ?? items[0]
  return best?.reutersCode ?? null
}

interface RawForeignCandle {
  localDate: string
  closePrice: number
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.abs(new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000
}

/** 필요한 과거 범위에 맞춰 일봉(~6개월)/주봉(~2년)/월봉(~9년) 중 가장 촘촘한 걸 고른다. */
function pickForeignPeriodType(fromDate: string): 'dayCandle' | 'weekCandle' | 'monthCandle' {
  const daysAgo = daysBetween(fromDate, new Date().toISOString().slice(0, 10))
  if (daysAgo <= 150) return 'dayCandle'
  if (daysAgo <= 700) return 'weekCandle'
  return 'monthCandle'
}

export async function getForeignDailyPrices(ticker: string, fromDate: string, toDate: string): Promise<HistoricalPricePoint[]> {
  const reutersCode = await resolveForeignSymbol(ticker)
  if (!reutersCode) return []

  const periodType = pickForeignPeriodType(fromDate)
  const url = `https://api.stock.naver.com/chart/foreign/item/${encodeURIComponent(reutersCode)}?periodType=${periodType}`
  const res = await fetch(url, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`해외 종목 과거 시세 조회 실패 (${res.status})`)
  const data = (await res.json()) as { priceInfos?: RawForeignCandle[] }

  const fromCompact = toCompactDate(fromDate)
  const toCompact = toCompactDate(toDate)
  return (data.priceInfos ?? [])
    .filter((p) => p.localDate >= fromCompact && p.localDate <= toCompact)
    .map((p) => ({ date: toIsoDate(p.localDate), close: p.closePrice }))
}

/** currency만 보고 국내/해외 조회를 자동으로 분기하는 진입점. 실패는 던지지 않고 렌더러 쪽에서
 * 종목별로 개별 처리(그 종목만 조용히 건너뜀)하도록 호출부에서 try/catch로 감싸 쓴다. */
export async function getHistoricalPrices(
  ticker: string,
  currency: 'KRW' | 'USD',
  fromDate: string,
  toDate: string
): Promise<HistoricalPricePoint[]> {
  return currency === 'USD' ? getForeignDailyPrices(ticker, fromDate, toDate) : getDomesticDailyPrices(ticker, fromDate, toDate)
}

/**
 * 배당 자동 조회 — "받은 배당/앞으로 받을 배당을 자동으로 계산"하려면 종목별 실제 배당 데이터가
 * 있어야 한다. 네이버가 최근 결산 기준 주당배당금·배당수익률(국내/해외 공통)과, 해외 종목에
 * 한해서는 가장 최근 배당지급일·배당락일까지 제공한다 — 이 정도가 개별 결제내역 없이 공개적으로
 * 얻을 수 있는 한계라, "지금까지 정확히 얼마 받았는지"의 전체 이력 재구성은 못 하고 대신 "최근
 * 결산 기준으로 계속된다면 연간 얼마"라는 예측치로 쓴다(DividendsPage에서 라벨링).
 */
export interface DividendInfo {
  /** 최근 결산 기준 연간 주당배당금 (종목 통화) */
  dividendPerShare: number | null
  dividendYieldPercent: number | null
  /** 해외 종목만 제공됨 (YYYY-MM-DD) */
  lastDividendPaidAt: string | null
  lastExDividendAt: string | null
}

interface TotalInfoItem {
  code: string
  value: string
}

function parseMoneyValue(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw.replace(/[,원%]/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function toIsoDateFromDotted(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{4})\.(\d{2})\.(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function findValue(items: TotalInfoItem[], code: string): string | undefined {
  return items.find((i) => i.code === code)?.value
}

async function getDomesticDividendInfo(code: string): Promise<DividendInfo | null> {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`, {
    headers: REQUEST_HEADERS
  })
  if (!res.ok) return null
  const data = (await res.json()) as { totalInfos?: TotalInfoItem[] }
  const items = data.totalInfos ?? []
  return {
    dividendPerShare: parseMoneyValue(findValue(items, 'dividend')),
    dividendYieldPercent: parseMoneyValue(findValue(items, 'dividendYieldRatio')),
    lastDividendPaidAt: null,
    lastExDividendAt: null
  }
}

async function getForeignDividendInfo(ticker: string): Promise<DividendInfo | null> {
  const reutersCode = await resolveForeignSymbol(ticker)
  if (!reutersCode) return null
  const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(reutersCode)}/basic`, {
    headers: REQUEST_HEADERS
  })
  if (!res.ok) return null
  const data = (await res.json()) as { stockItemTotalInfos?: TotalInfoItem[] }
  const items = data.stockItemTotalInfos ?? []
  return {
    dividendPerShare: parseMoneyValue(findValue(items, 'dividend')),
    dividendYieldPercent: parseMoneyValue(findValue(items, 'dividendYieldRatio')),
    lastDividendPaidAt: toIsoDateFromDotted(findValue(items, 'dividendAt')),
    lastExDividendAt: toIsoDateFromDotted(findValue(items, 'exDividendAt'))
  }
}

export async function getDividendInfo(ticker: string, currency: 'KRW' | 'USD'): Promise<DividendInfo | null> {
  return currency === 'USD' ? getForeignDividendInfo(ticker) : getDomesticDividendInfo(ticker)
}
