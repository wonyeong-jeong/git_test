import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../credentialStore', () => ({
  loadCredentials: vi.fn(() => ({ clientId: 'id', clientSecret: 'secret' }))
}))

import { loadCredentials } from '../credentialStore'
import { _resetTokenCacheForTests, getQuotes } from '../tossClient'

function tokenResponse(expiresIn: number) {
  return {
    ok: true,
    json: async () => ({ access_token: 'tok-1', token_type: 'Bearer', expires_in: expiresIn })
  }
}

function priceResponse() {
  return {
    ok: true,
    json: async () => ({
      result: [{ symbol: '005930', lastPrice: '241000', currency: 'KRW', timestamp: '2026-08-11T19:59:59.000+09:00' }]
    })
  }
}

describe('tossClient.getQuotes', () => {
  beforeEach(() => {
    _resetTokenCacheForTests()
    vi.mocked(loadCredentials).mockReturnValue({ clientId: 'id', clientSecret: 'secret' })
  })

  it('토큰을 발급받고 시세를 조회해서 숫자 타입의 lastPrice로 변환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(tokenResponse(3600)).mockResolvedValueOnce(priceResponse())
    vi.stubGlobal('fetch', fetchMock)

    const quotes = await getQuotes(['005930'])

    expect(quotes).toEqual([
      { symbol: '005930', lastPrice: 241000, currency: 'KRW', timestamp: '2026-08-11T19:59:59.000+09:00' }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 토큰 발급 요청이 client_credentials 방식으로 갔는지 확인
    const tokenCallBody = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(tokenCallBody.get('grant_type')).toBe('client_credentials')
  })

  it('만료 전 재호출 시 토큰을 재발급하지 않고 캐시를 재사용한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse(3600))
      .mockResolvedValueOnce(priceResponse())
      .mockResolvedValueOnce(priceResponse())
    vi.stubGlobal('fetch', fetchMock)

    await getQuotes(['005930'])
    await getQuotes(['005930'])

    // 1번째 호출: 토큰 발급 1회 + 시세 1회. 2번째 호출: 캐시된 토큰 재사용 -> 시세 1회만 추가
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('토큰이 만료되면 다시 발급받는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse(0)) // 즉시 만료
      .mockResolvedValueOnce(priceResponse())
      .mockResolvedValueOnce(tokenResponse(3600))
      .mockResolvedValueOnce(priceResponse())
    vi.stubGlobal('fetch', fetchMock)

    await getQuotes(['005930'])
    await getQuotes(['005930'])

    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('키가 등록되어 있지 않으면 명확한 에러를 던진다', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('호출되면 안 됨')
      })
    )

    await expect(getQuotes(['005930'])).rejects.toThrow('API 키가 등록되어 있지 않습니다')
  })
})
