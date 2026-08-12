import { useEffect, useState } from 'react'
import type { Holding, Profile } from './types'
import HoldingsPage from './features/holdings/HoldingsPage'
import ContributionPlanPage from './features/contribution-plan/ContributionPlanPage'
import PortfolioSimulationPage from './features/portfolio-simulation/PortfolioSimulationPage'
import DividendsPage from './features/dividends/DividendsPage'
import WatchlistPage from './features/watchlist/WatchlistPage'
import TransactionsPage from './features/transactions/TransactionsPage'
import CalendarPage from './features/calendar/CalendarPage'
import AssetGrowthPage from './features/asset-growth/AssetGrowthPage'
import StockDetailPage from './features/stock-detail/StockDetailPage'
import BrokerSettingsPage from './features/settings/BrokerSettingsPage'

type Tab =
  | 'holdings'
  | 'plans'
  | 'portfolio'
  | 'dividends'
  | 'watchlist'
  | 'transactions'
  | 'calendar'
  | 'assetGrowth'
  | 'broker'

export default function App(): JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('holdings')
  const [holdings, setHoldings] = useState<Holding[]>([])
  // 보유 종목 목록에서 종목을 클릭하면 여기 담긴다 — 사이드바 탭이 아니라 "드릴다운" 화면이라
  // 별도 Tab 값을 만들지 않고, 값이 있으면 어떤 탭이든 상관없이 상세 화면을 덮어 그린다.
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null)

  useEffect(() => {
    window.api.profiles.ensureDefault().then(setProfile)
  }, [])

  async function refreshHoldings(profileId: string): Promise<void> {
    const list = await window.api.holdings.list(profileId)
    setHoldings(list)
  }

  useEffect(() => {
    if (profile) refreshHoldings(profile.id)
  }, [profile])

  // 사이드바에서 다른 섹션으로 이동하면 상세 화면에서 빠져나온다
  function selectTab(next: Tab): void {
    setSelectedHoldingId(null)
    setTab(next)
  }

  const selectedHolding = holdings.find((h) => h.id === selectedHoldingId) ?? null

  if (!profile) {
    return <div className="loading">불러오는 중...</div>
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">📈 나의 포트폴리오</div>
        <div className="profile-name">{profile.name}</div>
        <nav>
          <button className={tab === 'holdings' ? 'active' : ''} onClick={() => selectTab('holdings')}>
            <span className="nav-icon">💼</span>보유 종목
          </button>
          <button className={tab === 'plans' ? 'active' : ''} onClick={() => selectTab('plans')}>
            <span className="nav-icon">🔁</span>적립식 계획 &amp; 시뮬레이션
          </button>
          <button className={tab === 'portfolio' ? 'active' : ''} onClick={() => selectTab('portfolio')}>
            <span className="nav-icon">📊</span>포트폴리오 합산
          </button>
          <button className={tab === 'dividends' ? 'active' : ''} onClick={() => selectTab('dividends')}>
            <span className="nav-icon">💰</span>배당
          </button>
          <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => selectTab('watchlist')}>
            <span className="nav-icon">⭐</span>관심종목
          </button>
          <button className={tab === 'transactions' ? 'active' : ''} onClick={() => selectTab('transactions')}>
            <span className="nav-icon">🧾</span>매매 이력
          </button>
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => selectTab('calendar')}>
            <span className="nav-icon">🗓️</span>캘린더
          </button>
          <button className={tab === 'assetGrowth' ? 'active' : ''} onClick={() => selectTab('assetGrowth')}>
            <span className="nav-icon">💹</span>자산 증식
          </button>
          <button className={tab === 'broker' ? 'active' : ''} onClick={() => selectTab('broker')}>
            <span className="nav-icon">🔌</span>API 연결
          </button>
        </nav>
      </aside>
      <main className="content">
        {selectedHolding ? (
          <StockDetailPage
            profileId={profile.id}
            holding={selectedHolding}
            onBack={() => setSelectedHoldingId(null)}
          />
        ) : (
          <>
            {tab === 'holdings' && (
              <HoldingsPage
                profileId={profile.id}
                holdings={holdings}
                onChanged={() => refreshHoldings(profile.id)}
                onOpenDetail={setSelectedHoldingId}
              />
            )}
            {tab === 'plans' && <ContributionPlanPage profileId={profile.id} holdings={holdings} />}
            {tab === 'portfolio' && <PortfolioSimulationPage profileId={profile.id} holdings={holdings} />}
            {tab === 'dividends' && <DividendsPage profileId={profile.id} holdings={holdings} />}
            {tab === 'watchlist' && <WatchlistPage profileId={profile.id} />}
            {tab === 'transactions' && <TransactionsPage profileId={profile.id} holdings={holdings} />}
            {tab === 'calendar' && <CalendarPage profileId={profile.id} holdings={holdings} />}
            {tab === 'assetGrowth' && <AssetGrowthPage profileId={profile.id} holdings={holdings} />}
            {tab === 'broker' && <BrokerSettingsPage />}
          </>
        )}
      </main>
    </div>
  )
}
