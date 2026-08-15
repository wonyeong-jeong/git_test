import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Profile, ProfileData } from './types'

// 저장 위치: Electron userData 디렉터리 아래 profiles/. 나중에 better-sqlite3 등
// 실제 DB로 교체할 때도 이 모듈의 함수 시그니처만 유지하면 상위 IPC 핸들러는 변경 불필요.
function dataDir(): string {
  const dir = join(app.getPath('userData'), 'profiles')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function profilesIndexPath(): string {
  return join(dataDir(), 'profiles.json')
}

function profileDataPath(profileId: string): string {
  return join(dataDir(), `${profileId}.json`)
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

const emptyProfileData: ProfileData = {
  holdings: [],
  manualPurchases: [],
  contributionPlans: [],
  dividendRecords: [],
  watchlist: [],
  assetSnapshots: []
}

// 스키마에 필드가 추가될 때(dividendRecords, assumedDividendYieldPercent, watchlist, side,
// assetSnapshots 등) 예전에 저장된 프로필 파일에는 그 필드가 없을 수 있으므로, 읽을 때마다
// 기본값으로 채워준다.
function normalizeProfileData(data: ProfileData): ProfileData {
  return {
    holdings: data.holdings ?? [],
    manualPurchases: (data.manualPurchases ?? []).map((p) => ({ ...p, side: p.side ?? 'BUY' })),
    contributionPlans: (data.contributionPlans ?? []).map((p) => ({
      ...p,
      assumedDividendYieldPercent: p.assumedDividendYieldPercent ?? 0,
      contributionType: p.contributionType ?? 'AMOUNT'
    })),
    dividendRecords: data.dividendRecords ?? [],
    watchlist: data.watchlist ?? [],
    assetSnapshots: data.assetSnapshots ?? []
  }
}

export function listProfiles(): Profile[] {
  return readJson<Profile[]>(profilesIndexPath(), [])
}

export function createProfile(name: string): Profile {
  const profiles = listProfiles()
  const profile: Profile = { id: randomUUID(), name, createdAt: new Date().toISOString() }
  profiles.push(profile)
  writeJson(profilesIndexPath(), profiles)
  writeJson(profileDataPath(profile.id), emptyProfileData)
  return profile
}

export function ensureDefaultProfile(): Profile {
  const profiles = listProfiles()
  if (profiles.length > 0) return profiles[0]
  return createProfile('기본 프로필')
}

export function getProfileData(profileId: string): ProfileData {
  return normalizeProfileData(readJson<ProfileData>(profileDataPath(profileId), emptyProfileData))
}

export function saveProfileData(profileId: string, data: ProfileData): void {
  writeJson(profileDataPath(profileId), data)
}
