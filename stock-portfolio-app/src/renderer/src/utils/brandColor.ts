/**
 * 종목별 "브랜드 느낌" 색상.
 *
 * 실제 회사 로고 이미지는 의도적으로 쓰지 않는다 — 국내 상장 종목만 2,700개가 넘고
 * 이 앱의 CSP(default-src 'self')가 외부 이미지 로딩도 막고 있어서, 로고를 쓰려면
 * 전부 로컬에 내장해야 하는데 그러면 번들이 무거워지고 종목이 늘어날 때마다 유지보수
 * 부담도 커진다. 대신 티커 문자열을 해시해서 고유한 색상을 뽑아 쓴다 — 비용이 0에
 * 가깝고 종목 수와 무관하게 확장된다. 몇몇 잘 알려진 종목만 실제 브랜드 컬러를
 * KNOWN_BRAND_COLORS에 하드코딩해서 익숙한 느낌을 살짝 더했다.
 *
 * 나중에 실제 로고가 꼭 필요해지면, 사용자가 실제로 보유한 소수 종목에 한해 로컬
 * 이미지를 추가하는 절충안을 고려할 것 (전체 종목에 적용하지 말 것).
 */

const KNOWN_BRAND_COLORS: Record<string, string> = {
  // 국내 (KRX 코드)
  '005930': '#1428A0', // 삼성전자
  '000660': '#C6161C', // SK하이닉스
  '035420': '#03C75A', // NAVER
  '035720': '#FFCD00', // 카카오
  '005380': '#002C5F', // 현대차
  '051910': '#B0114F', // LG화학
  '207940': '#00A0AF', // 삼성바이오로직스
  '068270': '#0055A4', // 셀트리온
  '005490': '#0058A3', // POSCO홀딩스
  '105560': '#0067AC', // KB금융

  // 해외 (티커)
  AAPL: '#000000',
  MSFT: '#00A4EF',
  GOOGL: '#4285F4',
  GOOG: '#4285F4',
  AMZN: '#FF9900',
  TSLA: '#CC0000',
  NVDA: '#76B900',
  META: '#0866FF',
  NFLX: '#E50914'
}

/** 문자열을 0~359 사이 hue 값으로 결정론적 해시 */
function hashHue(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

export function getBrandColor(ticker: string): string {
  const key = ticker.trim().toUpperCase()
  const known = KNOWN_BRAND_COLORS[key]
  if (known) return known
  return `hsl(${hashHue(key)}, 62%, 45%)`
}

/** 아바타에 표시할 1~2글자 이니셜 (한글이면 첫 글자, 아니면 영문 2글자) */
export function getStockInitial(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '?'
  return /[가-힣]/.test(trimmed[0]) ? trimmed[0] : trimmed.slice(0, 2).toUpperCase()
}
