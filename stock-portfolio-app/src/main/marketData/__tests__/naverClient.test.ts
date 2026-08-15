import { describe, expect, it, vi } from 'vitest'
import { getFxRates, getMajorIndices } from '../naverClient'

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

describe('getMajorIndices', () => {
  it('콤마 포함 문자열과 음수 등락을 숫자로 정확히 변환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        {
          reutersCode: 'KOSPI',
          indexName: '코스피',
          closePrice: '6,977.94',
          compareToPreviousClosePrice: '164.60',
          fluctuationsRatio: '2.42'
        },
        {
          reutersCode: '.IXIC',
          indexName: '나스닥 종합',
          closePrice: '26,729.16',
          compareToPreviousClosePrice: '-73.86',
          fluctuationsRatio: '-0.28'
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const indices = await getMajorIndices()

    expect(indices).toEqual([
      { code: 'KOSPI', name: '코스피', price: 6977.94, changeAmount: 164.6, changeRatio: 2.42 },
      { code: '.IXIC', name: '나스닥 종합', price: 26729.16, changeAmount: -73.86, changeRatio: -0.28 }
    ])
  })

  it('reutersCode가 없으면 indexName을 code로 대신 쓴다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        { indexName: '코스피', closePrice: '6,977.94', compareToPreviousClosePrice: '164.60', fluctuationsRatio: '2.42' }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const indices = await getMajorIndices()
    expect(indices[0].code).toBe('코스피')
  })

  it('응답이 실패하면 에러를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }))
    await expect(getMajorIndices()).rejects.toThrow('지수 조회 실패')
  })
})

describe('getFxRates', () => {
  it('환율 데이터를 숫자로 변환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        {
          reutersCode: 'FX_USDKRW',
          name: '미국 USD',
          closePrice: '1,418.50',
          fluctuations: '-1.70',
          fluctuationsRatio: '-0.12'
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const rates = await getFxRates()

    expect(rates).toEqual([
      { code: 'FX_USDKRW', name: '미국 USD', rate: 1418.5, changeAmount: -1.7, changeRatio: -0.12 }
    ])
  })

  it('응답이 실패하면 에러를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }))
    await expect(getFxRates()).rejects.toThrow('환율 조회 실패')
  })
})
