interface Props {
  enabled: boolean
  onToggle: (value: boolean) => void
  intervalSeconds: number
  onIntervalChange: (value: number) => void
  lastUpdated: Date | null
  marketsClosedNow: boolean
}

const INTERVAL_OPTIONS = [
  { label: '15초마다', seconds: 15 },
  { label: '30초마다', seconds: 30 },
  { label: '1분마다', seconds: 60 },
  { label: '5분마다', seconds: 300 }
]

/** 관심종목·보유종목 페이지가 공유하는 자동 갱신 토글 + 간격 선택 UI */
export default function AutoRefreshControls({
  enabled,
  onToggle,
  intervalSeconds,
  onIntervalChange,
  lastUpdated,
  marketsClosedNow
}: Props): JSX.Element {
  return (
    <div className="auto-refresh-controls">
      <label>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        자동 갱신
      </label>
      <select value={intervalSeconds} disabled={!enabled} onChange={(e) => onIntervalChange(Number(e.target.value))}>
        {INTERVAL_OPTIONS.map((opt) => (
          <option key={opt.seconds} value={opt.seconds}>
            {opt.label}
          </option>
        ))}
      </select>
      {lastUpdated && <span>마지막 갱신 {lastUpdated.toLocaleTimeString()}</span>}
      {enabled && marketsClosedNow && <span>관련 시장이 모두 장마감이라 대기 중이에요</span>}
    </div>
  )
}
