import { beforeEach, describe, expect, it, vi } from 'vitest'
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

const { default: handler, resetDailyMaterialRateLimitForTests, DAILY_PASSCODE_HEADER } = await import('./daily-material.ts')

function textResponse(json: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: { input_tokens: 1, output_tokens: 1 },
  }
}

const validResponse = {
  paragraphs: [[['テスト']]],
  zh: '測試',
  comprehensionPoints: ['a', 'b', 'c'],
}

const sampleBody = { level: 'N5', knownWords: [], newWords: [] }

function makeRequest(body: unknown, passcode = 'secret'): Request {
  return new Request('http://localhost/api/daily-material', {
    method: 'POST',
    headers: { [DAILY_PASSCODE_HEADER]: passcode, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  resetDailyMaterialRateLimitForTests()
  mockCreate.mockReset()
  process.env.DAILY_SECRET = 'secret'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('api/daily-material handler', () => {
  it('returns 401 when the passcode header does not match DAILY_SECRET', async () => {
    const res = await handler(makeRequest(sampleBody, 'wrong'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when DAILY_SECRET is not configured on the server', async () => {
    delete process.env.DAILY_SECRET
    const res = await handler(makeRequest(sampleBody, 'secret'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with the generated material on success', async () => {
    mockCreate.mockResolvedValueOnce(textResponse(validResponse))
    const res = await handler(makeRequest(sampleBody))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(validResponse)
  })

  it('retries once when the first response fails to parse/validate, then succeeds', async () => {
    mockCreate.mockResolvedValueOnce(textResponse({ not: 'valid' }))
    mockCreate.mockResolvedValueOnce(textResponse(validResponse))

    const res = await handler(makeRequest(sampleBody))

    expect(res.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('returns a 4xx with an error message (not a bare 500) when both attempts fail to parse', async () => {
    mockCreate.mockResolvedValue(textResponse({ not: 'valid' }))

    const res = await handler(makeRequest(sampleBody))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
  })

  it('returns 429 once the daily generation limit is exceeded', async () => {
    mockCreate.mockResolvedValue(textResponse(validResponse))
    for (let i = 0; i < 5; i++) {
      const res = await handler(makeRequest(sampleBody))
      expect(res.status).toBe(200)
    }
    const sixth = await handler(makeRequest(sampleBody))
    expect(sixth.status).toBe(429)
  })

  it('resetDailyMaterialRateLimitForTests clears the counter between tests', async () => {
    mockCreate.mockResolvedValue(textResponse(validResponse))
    for (let i = 0; i < 5; i++) {
      await handler(makeRequest(sampleBody))
    }
    resetDailyMaterialRateLimitForTests()
    const res = await handler(makeRequest(sampleBody))
    expect(res.status).toBe(200)
  })
})
