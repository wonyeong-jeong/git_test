import { describe, expect, it } from 'vitest'
import { getKrxSession, getMarketSession, getUsSession, isMarketActive } from './marketHours'

// 아래 시각들은 모두 2026-01-14(수) 기준 UTC 인스턴트를 직접 계산해서 만들었다.
// KST는 UTC+9(서머타임 없음), 1월의 미국 동부는 EST=UTC-5(서머타임 아님)이라
// 오프셋이 고정이므로 손으로 계산해도 안전하다.

describe('getKrxSession', () => {
  it('장전 시간외(KST 08:30)', () => {
    // 2026-01-14 08:30 KST = 2026-01-13 23:30 UTC
    expect(getKrxSession(new Date('2026-01-13T23:30:00Z'))).toBe('PRE')
  })

  it('정규장(KST 10:00)', () => {
    // 2026-01-14 10:00 KST = 01:00 UTC
    expect(getKrxSession(new Date('2026-01-14T01:00:00Z'))).toBe('REGULAR')
  })

  it('장후 시간외(KST 16:00)', () => {
    // 2026-01-14 16:00 KST = 07:00 UTC
    expect(getKrxSession(new Date('2026-01-14T07:00:00Z'))).toBe('AFTER')
  })

  it('장마감(KST 20:00)', () => {
    // 2026-01-14 20:00 KST = 11:00 UTC
    expect(getKrxSession(new Date('2026-01-14T11:00:00Z'))).toBe('CLOSED')
  })

  it('주말은 시간대와 무관하게 장마감', () => {
    // 2026-01-17(토) 10:00 KST = 01:00 UTC
    expect(getKrxSession(new Date('2026-01-17T01:00:00Z'))).toBe('CLOSED')
  })
})

describe('getUsSession', () => {
  it('프리마켓(ET 05:00, 1월=EST UTC-5)', () => {
    expect(getUsSession(new Date('2026-01-14T10:00:00Z'))).toBe('PRE')
  })

  it('정규장(ET 11:00)', () => {
    expect(getUsSession(new Date('2026-01-14T16:00:00Z'))).toBe('REGULAR')
  })

  it('애프터마켓(ET 18:00)', () => {
    expect(getUsSession(new Date('2026-01-14T23:00:00Z'))).toBe('AFTER')
  })

  it('장마감(ET 22:00)', () => {
    expect(getUsSession(new Date('2026-01-15T03:00:00Z'))).toBe('CLOSED')
  })

  it('주말은 장마감', () => {
    // 2026-01-17(토) ET 11:00 = 16:00 UTC
    expect(getUsSession(new Date('2026-01-17T16:00:00Z'))).toBe('CLOSED')
  })
})

describe('getMarketSession', () => {
  it('KRW는 KRX 세션을 따른다', () => {
    expect(getMarketSession('KRW', new Date('2026-01-14T01:00:00Z'))).toBe('REGULAR')
  })

  it('USD는 미국 증시 세션을 따른다', () => {
    // ET 11:00 = 16:00 UTC -> 미국 정규장
    expect(getMarketSession('USD', new Date('2026-01-14T16:00:00Z'))).toBe('REGULAR')
  })
})

describe('isMarketActive', () => {
  it('CLOSED만 false', () => {
    expect(isMarketActive('CLOSED')).toBe(false)
    expect(isMarketActive('PRE')).toBe(true)
    expect(isMarketActive('REGULAR')).toBe(true)
    expect(isMarketActive('AFTER')).toBe(true)
  })
})
