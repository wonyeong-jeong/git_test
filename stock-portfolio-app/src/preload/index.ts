import { contextBridge, ipcRenderer } from 'electron'
import type {
  AssetSnapshot,
  ContributionPlan,
  DividendRecord,
  Holding,
  ManualPurchase,
  Profile,
  WatchlistItem
} from '../main/types'
import type { Quote } from '../main/broker/tossClient'

const api = {
  profiles: {
    list: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
    create: (name: string): Promise<Profile> => ipcRenderer.invoke('profiles:create', name),
    ensureDefault: (): Promise<Profile> => ipcRenderer.invoke('profiles:ensureDefault')
  },
  holdings: {
    list: (profileId: string): Promise<Holding[]> => ipcRenderer.invoke('holdings:list', profileId),
    create: (
      profileId: string,
      input: Omit<Holding, 'id' | 'profileId' | 'createdAt'>
    ): Promise<Holding> => ipcRenderer.invoke('holdings:create', profileId, input),
    delete: (profileId: string, holdingId: string): Promise<boolean> =>
      ipcRenderer.invoke('holdings:delete', profileId, holdingId)
  },
  contributionPlans: {
    list: (profileId: string): Promise<ContributionPlan[]> =>
      ipcRenderer.invoke('contribution-plans:list', profileId),
    create: (
      profileId: string,
      input: Omit<ContributionPlan, 'id' | 'profileId' | 'createdAt'>
    ): Promise<ContributionPlan> => ipcRenderer.invoke('contribution-plans:create', profileId, input),
    delete: (profileId: string, planId: string): Promise<boolean> =>
      ipcRenderer.invoke('contribution-plans:delete', profileId, planId)
  },
  dividends: {
    list: (profileId: string): Promise<DividendRecord[]> => ipcRenderer.invoke('dividends:list', profileId),
    create: (
      profileId: string,
      input: Omit<DividendRecord, 'id' | 'profileId' | 'createdAt'>
    ): Promise<DividendRecord> => ipcRenderer.invoke('dividends:create', profileId, input),
    delete: (profileId: string, recordId: string): Promise<boolean> =>
      ipcRenderer.invoke('dividends:delete', profileId, recordId)
  },
  manualPurchases: {
    list: (profileId: string): Promise<ManualPurchase[]> =>
      ipcRenderer.invoke('manual-purchases:list', profileId),
    create: (
      profileId: string,
      input: Omit<ManualPurchase, 'id' | 'profileId' | 'createdAt'>
    ): Promise<ManualPurchase> => ipcRenderer.invoke('manual-purchases:create', profileId, input),
    delete: (profileId: string, recordId: string): Promise<boolean> =>
      ipcRenderer.invoke('manual-purchases:delete', profileId, recordId)
  },
  watchlist: {
    list: (profileId: string): Promise<WatchlistItem[]> => ipcRenderer.invoke('watchlist:list', profileId),
    create: (
      profileId: string,
      input: Omit<WatchlistItem, 'id' | 'profileId' | 'createdAt'>
    ): Promise<WatchlistItem> => ipcRenderer.invoke('watchlist:create', profileId, input),
    delete: (profileId: string, itemId: string): Promise<boolean> =>
      ipcRenderer.invoke('watchlist:delete', profileId, itemId)
  },
  broker: {
    hasCredentials: (): Promise<boolean> => ipcRenderer.invoke('broker:hasCredentials'),
    saveCredentials: (clientId: string, clientSecret: string): Promise<boolean> =>
      ipcRenderer.invoke('broker:saveCredentials', clientId, clientSecret),
    clearCredentials: (): Promise<boolean> => ipcRenderer.invoke('broker:clearCredentials'),
    getQuotes: (symbols: string[]): Promise<Quote[]> => ipcRenderer.invoke('broker:getQuotes', symbols)
  },
  assetSnapshots: {
    list: (profileId: string): Promise<AssetSnapshot[]> => ipcRenderer.invoke('asset-snapshots:list', profileId),
    record: (profileId: string, valuesByCurrency: Record<string, number>): Promise<AssetSnapshot> =>
      ipcRenderer.invoke('asset-snapshots:record', profileId, valuesByCurrency)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
