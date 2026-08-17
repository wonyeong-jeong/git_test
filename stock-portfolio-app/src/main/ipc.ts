import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import {
  listProfiles,
  createProfile,
  ensureDefaultProfile,
  getProfileData,
  saveProfileData
} from './store'
import type {
  AssetSnapshot,
  ContributionPlan,
  DividendRecord,
  FinancialGoal,
  Holding,
  IncomeSource,
  Loan,
  ManualPurchase,
  SavingsAccount,
  WatchlistItem
} from './types'
import { clearCredentials, hasCredentials, saveCredentials } from './broker/credentialStore'
import { getQuotes } from './broker/tossClient'
import {
  getDividendInfo,
  getEtfSummary,
  getFxRates,
  getHistoricalPrices,
  getMajorIndices,
  getStockNews
} from './marketData/naverClient'

export function registerIpcHandlers(): void {
  ipcMain.handle('profiles:list', () => listProfiles())
  ipcMain.handle('profiles:create', (_e, name: string) => createProfile(name))
  ipcMain.handle('profiles:ensureDefault', () => ensureDefaultProfile())

  ipcMain.handle('holdings:list', (_e, profileId: string) => getProfileData(profileId).holdings)

  ipcMain.handle(
    'holdings:create',
    (_e, profileId: string, input: Omit<Holding, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const holding: Holding = {
        ...input,
        id: randomUUID(),
        profileId,
        createdAt: new Date().toISOString()
      }
      data.holdings.push(holding)
      saveProfileData(profileId, data)
      return holding
    }
  )

  ipcMain.handle('holdings:delete', (_e, profileId: string, holdingId: string) => {
    const data = getProfileData(profileId)
    data.holdings = data.holdings.filter((h) => h.id !== holdingId)
    data.contributionPlans = data.contributionPlans.filter((p) => p.holdingId !== holdingId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('contribution-plans:list', (_e, profileId: string) => getProfileData(profileId).contributionPlans)

  ipcMain.handle(
    'contribution-plans:create',
    (_e, profileId: string, input: Omit<ContributionPlan, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const plan: ContributionPlan = {
        ...input,
        id: randomUUID(),
        profileId,
        createdAt: new Date().toISOString()
      }
      data.contributionPlans.push(plan)
      saveProfileData(profileId, data)
      return plan
    }
  )

  ipcMain.handle('contribution-plans:delete', (_e, profileId: string, planId: string) => {
    const data = getProfileData(profileId)
    data.contributionPlans = data.contributionPlans.filter((p) => p.id !== planId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('dividends:list', (_e, profileId: string) => getProfileData(profileId).dividendRecords)

  ipcMain.handle(
    'dividends:create',
    (_e, profileId: string, input: Omit<DividendRecord, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const record: DividendRecord = {
        ...input,
        id: randomUUID(),
        profileId,
        createdAt: new Date().toISOString()
      }
      data.dividendRecords.push(record)
      saveProfileData(profileId, data)
      return record
    }
  )

  ipcMain.handle('dividends:delete', (_e, profileId: string, recordId: string) => {
    const data = getProfileData(profileId)
    data.dividendRecords = data.dividendRecords.filter((r) => r.id !== recordId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('manual-purchases:list', (_e, profileId: string) => getProfileData(profileId).manualPurchases)

  ipcMain.handle(
    'manual-purchases:create',
    (_e, profileId: string, input: Omit<ManualPurchase, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const record: ManualPurchase = {
        ...input,
        id: randomUUID(),
        profileId,
        createdAt: new Date().toISOString()
      }
      data.manualPurchases.push(record)
      saveProfileData(profileId, data)
      return record
    }
  )

  ipcMain.handle('manual-purchases:delete', (_e, profileId: string, recordId: string) => {
    const data = getProfileData(profileId)
    data.manualPurchases = data.manualPurchases.filter((r) => r.id !== recordId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('watchlist:list', (_e, profileId: string) => getProfileData(profileId).watchlist)

  ipcMain.handle(
    'watchlist:create',
    (_e, profileId: string, input: Omit<WatchlistItem, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const item: WatchlistItem = {
        ...input,
        id: randomUUID(),
        profileId,
        createdAt: new Date().toISOString()
      }
      data.watchlist.push(item)
      saveProfileData(profileId, data)
      return item
    }
  )

  ipcMain.handle('watchlist:delete', (_e, profileId: string, itemId: string) => {
    const data = getProfileData(profileId)
    data.watchlist = data.watchlist.filter((w) => w.id !== itemId)
    saveProfileData(profileId, data)
    return true
  })

  // 토스증권 Open API — Market Data(시세)만 사용한다. 계좌/주문 관련 채널은 만들지 않는다.
  ipcMain.handle('broker:hasCredentials', () => hasCredentials())

  ipcMain.handle('broker:saveCredentials', (_e, clientId: string, clientSecret: string) => {
    saveCredentials(clientId, clientSecret)
    return true
  })

  ipcMain.handle('broker:clearCredentials', () => {
    clearCredentials()
    return true
  })

  ipcMain.handle('broker:getQuotes', (_e, symbols: string[]) => getQuotes(symbols))

  // 로그인/키 없이 접근 가능한 공개 시장 데이터라 profileId가 필요 없다
  ipcMain.handle('market-data:getIndices', () => getMajorIndices())
  ipcMain.handle('market-data:getFxRates', () => getFxRates())
  ipcMain.handle('market-data:getHistoricalPrices', (_e, ticker: string, currency: 'KRW' | 'USD', fromDate: string, toDate: string) =>
    getHistoricalPrices(ticker, currency, fromDate, toDate)
  )
  ipcMain.handle('market-data:getDividendInfo', (_e, ticker: string, currency: 'KRW' | 'USD') => getDividendInfo(ticker, currency))
  ipcMain.handle('market-data:getStockNews', (_e, ticker: string, currency: 'KRW' | 'USD', pageSize?: number) =>
    getStockNews(ticker, currency, pageSize)
  )
  ipcMain.handle('market-data:getEtfSummary', (_e, ticker: string, currency: 'KRW' | 'USD') => getEtfSummary(ticker, currency))

  ipcMain.handle('asset-snapshots:list', (_e, profileId: string) => getProfileData(profileId).assetSnapshots)

  // 오늘 날짜(로컬 기준) 스냅샷이 이미 있으면 덮어쓰고, 없으면 새로 추가한다 — 하루 1개만 유지
  ipcMain.handle('asset-snapshots:record', (_e, profileId: string, valuesByCurrency: Record<string, number>) => {
    const data = getProfileData(profileId)
    const today = new Date()
    const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const existing = data.assetSnapshots.find((s) => s.date === isoDate)
    if (existing) {
      existing.valuesByCurrency = valuesByCurrency
      existing.createdAt = new Date().toISOString()
      saveProfileData(profileId, data)
      return existing
    }

    const snapshot: AssetSnapshot = {
      id: randomUUID(),
      profileId,
      date: isoDate,
      valuesByCurrency,
      createdAt: new Date().toISOString()
    }
    data.assetSnapshots.push(snapshot)
    saveProfileData(profileId, data)
    return snapshot
  })

  // ---------- 재무 정보(월급/적금/대출) & 목표 ----------

  ipcMain.handle('income-sources:list', (_e, profileId: string) => getProfileData(profileId).incomeSources)
  ipcMain.handle(
    'income-sources:create',
    (_e, profileId: string, input: Omit<IncomeSource, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const item: IncomeSource = { ...input, id: randomUUID(), profileId, createdAt: new Date().toISOString() }
      data.incomeSources.push(item)
      saveProfileData(profileId, data)
      return item
    }
  )
  ipcMain.handle('income-sources:delete', (_e, profileId: string, itemId: string) => {
    const data = getProfileData(profileId)
    data.incomeSources = data.incomeSources.filter((i) => i.id !== itemId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('savings-accounts:list', (_e, profileId: string) => getProfileData(profileId).savingsAccounts)
  ipcMain.handle(
    'savings-accounts:create',
    (_e, profileId: string, input: Omit<SavingsAccount, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const item: SavingsAccount = { ...input, id: randomUUID(), profileId, createdAt: new Date().toISOString() }
      data.savingsAccounts.push(item)
      saveProfileData(profileId, data)
      return item
    }
  )
  ipcMain.handle('savings-accounts:delete', (_e, profileId: string, itemId: string) => {
    const data = getProfileData(profileId)
    data.savingsAccounts = data.savingsAccounts.filter((i) => i.id !== itemId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('loans:list', (_e, profileId: string) => getProfileData(profileId).loans)
  ipcMain.handle('loans:create', (_e, profileId: string, input: Omit<Loan, 'id' | 'profileId' | 'createdAt'>) => {
    const data = getProfileData(profileId)
    const item: Loan = { ...input, id: randomUUID(), profileId, createdAt: new Date().toISOString() }
    data.loans.push(item)
    saveProfileData(profileId, data)
    return item
  })
  ipcMain.handle('loans:delete', (_e, profileId: string, itemId: string) => {
    const data = getProfileData(profileId)
    data.loans = data.loans.filter((i) => i.id !== itemId)
    saveProfileData(profileId, data)
    return true
  })

  ipcMain.handle('financial-goals:list', (_e, profileId: string) => getProfileData(profileId).financialGoals)
  ipcMain.handle(
    'financial-goals:create',
    (_e, profileId: string, input: Omit<FinancialGoal, 'id' | 'profileId' | 'createdAt'>) => {
      const data = getProfileData(profileId)
      const item: FinancialGoal = { ...input, id: randomUUID(), profileId, createdAt: new Date().toISOString() }
      data.financialGoals.push(item)
      saveProfileData(profileId, data)
      return item
    }
  )
  ipcMain.handle('financial-goals:delete', (_e, profileId: string, itemId: string) => {
    const data = getProfileData(profileId)
    data.financialGoals = data.financialGoals.filter((i) => i.id !== itemId)
    saveProfileData(profileId, data)
    return true
  })
}
