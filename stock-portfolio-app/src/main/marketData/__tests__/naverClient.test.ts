import { describe, expect, it, vi } from 'vitest'
import {
  getDividendInfo,
  getDomesticDailyPrices,
  getFxRates,
  getHistoricalPrices,
  getMajorIndices,
  resolveForeignSymbol
} from '../naverClient'

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body }
}

function textResponse(body: string) {
  return { ok: true, text: async () => body }
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

describe('getDomesticDailyPrices', () => {
  it('siseJson.naver의 JS 배열 리터럴(홑따옴표 헤더 포함)에서 날짜별 종가만 정확히 뽑아낸다', async () => {
    const body = ` [['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율'],

		["20240102", 78200, 79800, 78200, 79600, 17142847, 54.05],
		["20240103", 78500, 78800, 77000, 77000, 21753644, 54.04]

]`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(textResponse(body)))

    const prices = await getDomesticDailyPrices('005930', '2024-01-01', '2024-01-31')

    expect(prices).toEqual([
      { date: '2024-01-02', close: 79600 },
      { date: '2024-01-03', close: 77000 }
    ])
  })

  it('응답이 실패하면 에러를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }))
    await expect(getDomesticDailyPrices('005930', '2024-01-01', '2024-01-31')).rejects.toThrow('국내 종목 과거 시세 조회 실패')
  })
})

describe('resolveForeignSymbol', () => {
  it('티커와 정확히 일치하면서 미국 종목인 항목의 reutersCode를 고른다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        items: [
          { code: 'QLD', reutersCode: 'QLD', nationCode: 'USA', category: 'stock' },
          { code: 'QLDY', reutersCode: 'QLDY.O', nationCode: 'USA', category: 'stock' }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await resolveForeignSymbol('QLD')).toBe('QLD')
  })

  it('결과가 없으면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ items: [] })))
    expect(await resolveForeignSymbol('NOPE')).toBeNull()
  })
})

describe('getHistoricalPrices', () => {
  it('KRW면 국내 API를, USD면 해외 API를 호출하도록 분기한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse(` [['날짜'],["20240102", 1, 1, 1, 100, 1, 1]]`))
    vi.stubGlobal('fetch', fetchMock)

    const prices = await getHistoricalPrices('005930', 'KRW', '2024-01-01', '2024-01-31')
    expect(prices).toEqual([{ date: '2024-01-02', close: 100 }])
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('siseJson.naver'), expect.anything())
  })
})

describe('getDividendInfo', () => {
  it('국내 종목은 integration API의 totalInfos에서 배당 정보를 파싱한다', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        totalInfos: [
          { code: 'dividendYieldRatio', key: '배당수익률', value: '0.61%' },
          { code: 'dividend', key: '주당배당금', value: '1,668원' }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await getDividendInfo('005930', 'KRW')).toEqual({
      dividendPerShare: 1668,
      dividendYieldPercent: 0.61,
      lastDividendPaidAt: null,
      lastExDividendAt: null
    })
  })

  it('해외 종목은 심볼을 먼저 찾고 basic API의 stockItemTotalInfos에서 배당·배당일을 파싱한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ code: 'AAPL', reutersCode: 'AAPL.O', nationCode: 'USA', category: 'stock' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          stockItemTotalInfos: [
            { code: 'dividend', key: '주당배당금', value: '1.08' },
            { code: 'dividendYieldRatio', key: '배당수익률', value: '0.35%' },
            { code: 'dividendAt', key: '배당일', value: '2026.08.13.' },
            { code: 'exDividendAt', key: '배당락일', value: '2026.08.10.' }
          ]
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    expect(await getDividendInfo('AAPL', 'USD')).toEqual({
      dividendPerShare: 1.08,
      dividendYieldPercent: 0.35,
      lastDividendPaidAt: '2026-08-13',
      lastExDividendAt: '2026-08-10'
    })
  })

  it('해외 종목 심볼을 못 찾으면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ items: [] })))
    expect(await getDividendInfo('NOPE', 'USD')).toBeNull()
  })
})
