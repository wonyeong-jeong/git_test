import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// safeStorage/app은 실제 Electron 런타임에서만 존재하므로, 왕복(암호화->저장->복호화)
// 로직만 검증할 수 있게 간단한 가역 변환으로 목킹한다.
const testDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { mkdtempSync } = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { tmpdir } = require('os')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('path')
  return mkdtempSync(join(tmpdir(), 'stock-portfolio-test-'))
})

vi.mock('electron', () => ({
  app: { getPath: () => testDir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf-8'),
    decryptString: (b: Buffer) => b.toString('utf-8').replace(/^ENC:/, '')
  }
}))

const { clearCredentials, hasCredentials, loadCredentials, saveCredentials } = await import('../credentialStore')

describe('credentialStore', () => {
  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('저장 전에는 hasCredentials가 false다', () => {
    expect(hasCredentials()).toBe(false)
  })

  it('저장 후 다시 불러오면 원본 값과 정확히 일치한다 (암호화 왕복)', () => {
    saveCredentials('client-abc', 'secret-xyz')
    expect(hasCredentials()).toBe(true)
    expect(loadCredentials()).toEqual({ clientId: 'client-abc', clientSecret: 'secret-xyz' })
  })

  it('clearCredentials 이후에는 조회되지 않는다', () => {
    saveCredentials('a', 'b')
    clearCredentials()
    expect(hasCredentials()).toBe(false)
    expect(loadCredentials()).toBeNull()
  })
})
