import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * 증권사 API 키(client_id/client_secret)를 평문으로 저장하지 않는다.
 * Electron의 safeStorage(OS 레벨 암호화, Windows는 DPAPI)로 암호화해서 저장한다.
 * 추가 네이티브 의존성(keytar 등) 없이 Electron 내장 기능만 사용.
 */

interface StoredCredentials {
  clientIdEncrypted: string // base64
  clientSecretEncrypted: string // base64
}

export interface BrokerCredentials {
  clientId: string
  clientSecret: string
}

function credentialsPath(): string {
  return join(app.getPath('userData'), 'broker-credentials.json')
}

export function hasCredentials(): boolean {
  return existsSync(credentialsPath())
}

export function saveCredentials(clientId: string, clientSecret: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 시스템에서는 안전한 암호화 저장(safeStorage)을 사용할 수 없습니다.')
  }
  const data: StoredCredentials = {
    clientIdEncrypted: safeStorage.encryptString(clientId).toString('base64'),
    clientSecretEncrypted: safeStorage.encryptString(clientSecret).toString('base64')
  }
  writeFileSync(credentialsPath(), JSON.stringify(data), 'utf-8')
}

export function loadCredentials(): BrokerCredentials | null {
  const path = credentialsPath()
  if (!existsSync(path)) return null
  const data = JSON.parse(readFileSync(path, 'utf-8')) as StoredCredentials
  return {
    clientId: safeStorage.decryptString(Buffer.from(data.clientIdEncrypted, 'base64')),
    clientSecret: safeStorage.decryptString(Buffer.from(data.clientSecretEncrypted, 'base64'))
  }
}

export function clearCredentials(): void {
  const path = credentialsPath()
  if (existsSync(path)) unlinkSync(path)
}
