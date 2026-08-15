import { useMemo, useState } from 'react'
import krxStocks from '../data/krxStocks.json'

export interface StockOption {
  code: string
  name: string
}

interface Props {
  onSelect: (option: StockOption) => void
  placeholder?: string
}

const ALL_STOCKS = krxStocks as StockOption[]
const MAX_RESULTS = 20

/**
 * 국내(KRX) 상장종목 코드/이름 자동완성 콤보박스.
 * 데이터는 두 소스를 한 번 내려받아 합쳐서 앱에 내장한 정적 파일이다(`data/krxStocks.json`,
 * 오프라인 동작):
 *   - 일반 상장주식: 한국거래소 KIND 상장법인목록 (2026-08 기준 2,701개)
 *   - ETF: 네이버 금융 ETF 목록 (2026-08 기준 1,163개) — KIND 상장법인목록은 ETF를
 *     "법인"으로 분류하지 않아서 빠져 있었다(예: KODEX 200, TIGER 미국S&P500 등이 검색 안 되던 문제)
 * 신규상장/상장폐지가 반영되려면 이 파일을 주기적으로 갱신해야 한다.
 */
export default function StockSearchInput({ onSelect, placeholder }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const starts: StockOption[] = []
    const includes: StockOption[] = []
    for (const s of ALL_STOCKS) {
      if (s.code.startsWith(q) || s.name.toLowerCase().startsWith(q)) starts.push(s)
      else if (s.name.toLowerCase().includes(q)) includes.push(s)
    }
    // 이름이 짧을수록(질의어와 더 정확히 일치할수록) 대표 종목일 가능성이 높다고 보고 우선 정렬
    starts.sort((a, b) => a.name.length - b.name.length)
    return [...starts, ...includes].slice(0, MAX_RESULTS)
  }, [query])

  return (
    <div className="stock-search">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? '종목명 또는 코드 검색 (예: 삼성전자, 005930)'}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="stock-search-dropdown">
          {results.map((r) => (
            <li
              key={r.code}
              onMouseDown={() => {
                onSelect(r)
                setQuery('')
                setOpen(false)
              }}
            >
              <span>{r.name}</span>
              <span className="muted">{r.code}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && results.length === 0 && (
        <ul className="stock-search-dropdown">
          <li className="muted" style={{ cursor: 'default' }}>
            검색 결과 없음 (해외주식 등은 아래 '직접 입력' 사용)
          </li>
        </ul>
      )}
    </div>
  )
}
