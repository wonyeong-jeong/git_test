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

/**
 * 네이버가 주는 배당수익률(dividendYieldRatio)은 표시용으로 반올림된 값이라 소수점 한 자리만
 * 나오는 경우가 많다(예: "0.6%"). 같은 응답에 있는 주당배당금 ÷ 현재가를 직접 나누면 훨씬
 * 정밀한 값을 얻을 수 있어서, 두 값을 다 구할 수 있을 땐 이 직접 계산값을 우선 쓴다 — 네이버가
 * 반올림해서 잃어버린 소수점을 이렇게 보완한다. 어느 한쪽이라도 없으면 네이버 값 그대로 쓴다.
 */
function preciseDividendYieldPercent(dividendPerShare: number | null, closePrice: number | null, fallback: number | null): number | null {
  if (dividendPerShare != null && closePrice != null && closePrice > 0) {
    return (dividendPerShare / closePrice) * 100
  }
  return fallback
}

async function getDomesticDividendInfo(code: string): Promise<DividendInfo | null> {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`, {
    headers: REQUEST_HEADERS
  })
  if (!res.ok) return null
  const data = (await res.json()) as { totalInfos?: TotalInfoItem[] }
  const items = data.totalInfos ?? []
  const dividendPerShare = parseMoneyValue(findValue(items, 'dividend'))
  const closePrice = parseMoneyValue(findValue(items, 'lastClosePrice'))
  return {
    dividendPerShare,
    dividendYieldPercent: preciseDividendYieldPercent(dividendPerShare, closePrice, parseMoneyValue(findValue(items, 'dividendYieldRatio'))),
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
  const data = (await res.json()) as { stockItemTotalInfos?: TotalInfoItem[]; closePrice?: string }
  const items = data.stockItemTotalInfos ?? []
  const dividendPerShare = parseMoneyValue(findValue(items, 'dividend'))
  const closePrice = parseMoneyValue(data.closePrice)
  return {
    dividendPerShare,
    dividendYieldPercent: preciseDividendYieldPercent(dividendPerShare, closePrice, parseMoneyValue(findValue(items, 'dividendYieldRatio'))),
    lastDividendPaidAt: toIsoDateFromDotted(findValue(items, 'dividendAt')),
    lastExDividendAt: toIsoDateFromDotted(findValue(items, 'exDividendAt'))
  }
}

export async function getDividendInfo(ticker: string, currency: 'KRW' | 'USD'): Promise<DividendInfo | null> {
  return currency === 'USD' ? getForeignDividendInfo(ticker) : getDomesticDividendInfo(ticker)
}

/**
 * 종목 뉴스 — 네이버 모바일 증권의 뉴스 API를 그대로 쓴다. 응답은 "뉴스 클러스터"의 배열이고
 * (관련 기사끼리 묶은 것), 각 클러스터의 대표 기사 하나(items[0])만 뽑아서 보여준다. 국내/해외
 * 종목 둘 다 같은 엔드포인트를 코드만 바꿔서 쓸 수 있다.
 */
export interface StockNewsItem {
  title: string
  officeName: string
  /** ISO 8601 (YYYY-MM-DDTHH:mm:00) */
  publishedAt: string
  url: string
}

interface RawNewsGroup {
  items?: Array<{ title: string; officeName: string; datetime: string; mobileNewsUrl: string }>
}

/** "202608171618" (YYYYMMDDHHmm) → ISO 문자열 */
function newsDatetimeToIso(raw: string): string {
  if (raw.length < 12) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:00`
}

async function fetchStockNews(code: string, pageSize: number): Promise<StockNewsItem[]> {
  const res = await fetch(`https://m.stock.naver.com/api/news/stock/${encodeURIComponent(code)}?pageSize=${pageSize}&page=1`, {
    headers: REQUEST_HEADERS
  })
  if (!res.ok) throw new Error(`종목 뉴스 조회 실패 (${res.status})`)
  const data = (await res.json()) as RawNewsGroup[]
  return data
    .map((group) => group.items?.[0])
    .filter((item): item is NonNullable<typeof item> => item != null)
    .map((item) => ({
      title: item.title,
      officeName: item.officeName,
      publishedAt: newsDatetimeToIso(item.datetime),
      url: item.mobileNewsUrl
    }))
}

export async function getStockNews(ticker: string, currency: 'KRW' | 'USD', pageSize = 10): Promise<StockNewsItem[]> {
  if (currency === 'USD') {
    const reutersCode = await resolveForeignSymbol(ticker)
    if (!reutersCode) return []
    return fetchStockNews(reutersCode, pageSize)
  }
  return fetchStockNews(ticker, pageSize)
}

/**
 * ETF 요약 정보 — "ETF면 보유비중 같은 걸 보여줬으면" 요청에 대한 답. 구성종목별 정확한 보유
 * 비중(PDF/포트폴리오 상세)까지는 공개적으로 안정된 API를 찾지 못해서 제공하지 못한다 — 대신
 * 네이버가 국내 ETF에 한해 제공하는 요약 지표(운용사, 총보수, TTM 배당수익률, 기간별 수익률,
 * NAV 괴리율)를 보여준다. 해외 ETF는 "ETF다"라는 사실 자체(isEtf)만 확인 가능하고 그 이상의
 * 수치는 이 데이터 출처로는 못 구한다.
 */
export interface EtfSummary {
  isEtf: boolean
  issuerName: string | null
  totalFeePercent: number | null
  dividendYieldTtmPercent: number | null
  returnRate1mPercent: number | null
  returnRate3mPercent: number | null
  returnRate1yPercent: number | null
  navDeviationPercent: number | null
}

interface RawEtfKeyIndicator {
  issuerName?: string
  totalFee?: number
  dividendYieldTtm?: number
  returnRate1m?: number
  returnRate3m?: number
  returnRate1y?: number
  deviationRate?: number
}

function emptyEtfSummary(isEtf = false): EtfSummary {
  return {
    isEtf,
    issuerName: null,
    totalFeePercent: null,
    dividendYieldTtmPercent: null,
    returnRate1mPercent: null,
    returnRate3mPercent: null,
    returnRate1yPercent: null,
    navDeviationPercent: null
  }
}

async function getDomesticEtfSummary(code: string): Promise<EtfSummary> {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/integration`, {
    headers: REQUEST_HEADERS
  })
  if (!res.ok) return emptyEtfSummary()
  const data = (await res.json()) as { etfKeyIndicator?: RawEtfKeyIndicator }
  const k = data.etfKeyIndicator
  if (!k) return emptyEtfSummary()
  return {
    isEtf: true,
    issuerName: k.issuerName ?? null,
    totalFeePercent: k.totalFee ?? null,
    dividendYieldTtmPercent: k.dividendYieldTtm ?? null,
    returnRate1mPercent: k.returnRate1m ?? null,
    returnRate3mPercent: k.returnRate3m ?? null,
    returnRate1yPercent: k.returnRate1y ?? null,
    navDeviationPercent: k.deviationRate ?? null
  }
}

async function getForeignEtfSummary(ticker: string): Promise<EtfSummary> {
  const reutersCode = await resolveForeignSymbol(ticker)
  if (!reutersCode) return emptyEtfSummary()
  const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(reutersCode)}/basic`, { headers: REQUEST_HEADERS })
  if (!res.ok) return emptyEtfSummary()
  const data = (await res.json()) as { isEtf?: boolean }
  // 해외 ETF는 이 출처로는 "ETF다"라는 사실만 확인되고, 보수·수익률 등 세부 지표는 못 구한다.
  return emptyEtfSummary(data.isEtf === true)
}

export async function getEtfSummary(ticker: string, currency: 'KRW' | 'USD'): Promise<EtfSummary> {
  return currency === 'USD' ? getForeignEtfSummary(ticker) : getDomesticEtfSummary(ticker)
}
