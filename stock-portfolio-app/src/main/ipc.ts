import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import {
  listProfiles,
  createProfile,
  ensureDefaultProfile,
  getProfileData,
  saveProfileData
} from './store'
import type { ContributionPlan, DividendRecord, Holding, ManualPurchase, WatchlistItem } from './types'
import { clearCredentials, hasCredentials, saveCredentials } from './broker/credentialStore'
import { getQuotes } from './broker/tossClient'

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
}
