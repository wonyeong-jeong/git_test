/**
 * 시장 개장 시간 판별 — 종목 통화(KRW/USD)에 따라 한국거래소(KRX) 또는 미국 증시 시간을
 * 기준으로 지금이 어떤 세션인지 판단한다.
 *
 * Intl.DateTimeFormat의 timeZone 옵션으로 그 지역의 실제 벽시계 시각을 구하기 때문에,
 * 이 앱을 실행하는 컴퓨터의 시스템 시간대와 무관하게 정확하고 서머타임(DST)도 ICU가
 * 자동으로 처리한다 — 직접 UTC 오프셋을 하드코딩하지 않는 이유.
 *
 * 공휴일은 반영하지 않는다(범위 밖). 즉 이 모듈은 "지금 시세 자동 갱신을 시도할 가치가
 * 있는 시간대인가"를 걸러내는 용도이지, 실제 개장 여부를 100% 보장하지 않는다.
 */

export type MarketSession = 'PRE' | 'REGULAR' | 'AFTER' | 'CLOSED'

interface WallClock {
  /** 0=일 ... 6=토 */
  weekday: number
  minutesSinceMidnight: number
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function wallClockIn(timeZone: string, now: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)

  let weekday = 0
  let hour = 0
  let minute = 0
  for (const part of parts) {
    if (part.type === 'weekday') weekday = WEEKDAY_NAMES.indexOf(part.value)
    else if (part.type === 'hour') hour = Number(part.value)
    else if (part.type === 'minute') minute = Number(part.value)
  }
  return { weekday, minutesSinceMidnight: hour * 60 + minute }
}

const MIN = (h: number, m = 0): number => h * 60 + m

interface SessionRanges {
  pre: [number, number]
  regular: [number, number]
  after: [number, number]
}

function sessionFromRanges(wall: WallClock, ranges: SessionRanges): MarketSession {
  if (wall.weekday === 0 || wall.weekday === 6) return 'CLOSED' // 주말 (공휴일은 미반영)
  const t = wall.minutesSinceMidnight
  if (t >= ranges.pre[0] && t < ranges.pre[1]) return 'PRE'
  if (t >= ranges.regular[0] && t < ranges.regular[1]) return 'REGULAR'
  if (t >= ranges.after[0] && t < ranges.after[1]) return 'AFTER'
  return 'CLOSED'
}

const KRX_RANGES: SessionRanges = {
  pre: [MIN(8), MIN(9)],
  regular: [MIN(9), MIN(15, 30)],
  after: [MIN(15, 30), MIN(18)]
}

const US_RANGES: SessionRanges = {
  pre: [MIN(4), MIN(9, 30)],
  regular: [MIN(9, 30), MIN(16)],
  after: [MIN(16), MIN(20)]
}

/** 한국거래소 — 장전 시간외(08:00~09:00) / 정규장(09:00~15:30) / 장후 시간외(15:30~18:00) */
export function getKrxSession(now: Date = new Date()): MarketSession {
  return sessionFromRanges(wallClockIn('Asia/Seoul', now), KRX_RANGES)
}

/** 미국 증시 — 프리마켓(04:00~09:30 ET) / 정규장(09:30~16:00 ET) / 애프터마켓(16:00~20:00 ET) */
export function getUsSession(now: Date = new Date()): MarketSession {
  return sessionFromRanges(wallClockIn('America/New_York', now), US_RANGES)
}

/** 종목 통화 기준으로 알맞은 시장의 세션을 반환한다 (KRW → KRX, USD → 미국 증시) */
export function getMarketSession(currency: 'KRW' | 'USD', now: Date = new Date()): MarketSession {
  return currency === 'USD' ? getUsSession(now) : getKrxSession(now)
}

export function isMarketActive(session: MarketSession): boolean {
  return session !== 'CLOSED'
}

const KR_LABELS: Record<MarketSession, string> = {
  PRE: '장전 시간외',
  REGULAR: '정규장',
  AFTER: '장후 시간외',
  CLOSED: '장마감'
}

const US_LABELS: Record<MarketSession, string> = {
  PRE: '프리마켓',
  REGULAR: '정규장',
  AFTER: '애프터마켓',
  CLOSED: '장마감'
}

export function getSessionLabel(currency: 'KRW' | 'USD', session: MarketSession): string {
  return currency === 'USD' ? US_LABELS[session] : KR_LABELS[session]
}
