import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDailyMaterial } from './dailyMaterialClient.ts'
import { setDailyPasscode } from './dailyPasscode.ts'

const sampleBody = { level: 'N5' as const, knownWords: [], newWords: [] }
const sampleResponse = { paragraphs: [[['テスト']]], zh: '測試', comprehensionPoints: ['a', 'b', 'c'] }

beforeEach(() => {
  setDailyPasscode('secret')
})

afterEach(() => {
  vi.unstubAllGlobals()
  setDailyPasscode('')
})

describe('fetchDailyMaterial', () => {
  it('returns ok with parsed data on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(sampleResponse), { status: 200 })),
    )
    const result = await fetchDailyMaterial(sampleBody)
    expect(result).toEqual({ ok: true, data: sampleResponse })
  })

  it('maps a 401 to reason "passcode"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 401 })),
    )
    const result = await fetchDailyMaterial(sampleBody)
    expect(result).toEqual({ ok: false, error: { reason: 'passcode' } })
  })

  it('maps a 429 to reason "rate-limit"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 429 })),
    )
    const result = await fetchDailyMaterial(sampleBody)
    expect(result).toEqual({ ok: false, error: { reason: 'rate-limit' } })
  })

  it('maps a rejected fetch (offline) to reason "network"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const result = await fetchDailyMaterial(sampleBody)
    expect(result).toEqual({ ok: false, error: { reason: 'network' } })
  })

  it('maps any other non-2xx status to reason "server"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 502 })),
    )
    const result = await fetchDailyMaterial(sampleBody)
    expect(result).toEqual({ ok: false, error: { reason: 'server' } })
  })

  it('sends the passcode header from dailyPasscode storage', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(sampleResponse), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    await fetchDailyMaterial(sampleBody)
    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Daily-Passcode']).toBe('secret')
  })
})
