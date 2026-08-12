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

  if (!profile) {
    return <div className="loading">불러오는 중...</div>
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">📈 나의 포트폴리오</div>
        <div className="profile-name">{profile.name}</div>
        <nav>
          <button className={tab === 'holdings' ? 'active' : ''} onClick={() => setTab('holdings')}>
            <span className="nav-icon">💼</span>보유 종목
          </button>
          <button className={tab === 'plans' ? 'active' : ''} onClick={() => setTab('plans')}>
            <span className="nav-icon">🔁</span>적립식 계획 &amp; 시뮬레이션
          </button>
          <button className={tab === 'portfolio' ? 'active' : ''} onClick={() => setTab('portfolio')}>
            <span className="nav-icon">📊</span>포트폴리오 합산
          </button>
          <button className={tab === 'dividends' ? 'active' : ''} onClick={() => setTab('dividends')}>
            <span className="nav-icon">💰</span>배당
          </button>
          <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => setTab('watchlist')}>
            <span className="nav-icon">⭐</span>관심종목
          </button>
          <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>
            <span className="nav-icon">🧾</span>매매 이력
          </button>
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
            <span className="nav-icon">🗓️</span>캘린더
          </button>
          <button className={tab === 'assetGrowth' ? 'active' : ''} onClick={() => setTab('assetGrowth')}>
            <span className="nav-icon">💹</span>자산 증식
          </button>
          <button className={tab === 'broker' ? 'active' : ''} onClick={() => setTab('broker')}>
            <span className="nav-icon">🔌</span>API 연결
          </button>
        </nav>
      </aside>
      <main className="content">
        {tab === 'holdings' && (
          <HoldingsPage profileId={profile.id} holdings={holdings} onChanged={() => refreshHoldings(profile.id)} />
        )}
        {tab === 'plans' && <ContributionPlanPage profileId={profile.id} holdings={holdings} />}
        {tab === 'portfolio' && <PortfolioSimulationPage profileId={profile.id} holdings={holdings} />}
        {tab === 'dividends' && <DividendsPage profileId={profile.id} holdings={holdings} />}
        {tab === 'watchlist' && <WatchlistPage profileId={profile.id} />}
        {tab === 'transactions' && <TransactionsPage profileId={profile.id} holdings={holdings} />}
        {tab === 'calendar' && <CalendarPage profileId={profile.id} holdings={holdings} />}
        {tab === 'assetGrowth' && <AssetGrowthPage profileId={profile.id} holdings={holdings} />}
        {tab === 'broker' && <BrokerSettingsPage />}
      </main>
    </div>
  )
}
