import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

const { default: handler, resetDailyMaterialRateLimitForTests, DAILY_PASSCODE_HEADER } = await import(
  './daily-material.ts'
)

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
  grammarNotes: [{ sentence: [['テスト']], zh: '測試翻譯', grammarPoint: '文法點', explanation: '說明' }],
}

const sampleBody = { level: 'N5', knownWords: [], newWords: [] }

// Mirrors the Node-style invocation Vercel's runtime actually uses: req is a
// readable stream with plain-object (lowercased) headers, res a writable sink.
function makeReq(body: unknown, passcode = 'secret', method = 'POST'): IncomingMessage {
  const readable = Readable.from([Buffer.from(JSON.stringify(body))])
  return Object.assign(readable, {
    method,
    headers: { [DAILY_PASSCODE_HEADER.toLowerCase()]: passcode },
  }) as unknown as IncomingMessage
}

function makeRes(): { res: ServerResponse; state: { status: number; data: string } } {
  const state = { status: 0, data: '' }
  const res = {
    set statusCode(value: number) {
      state.status = value
    },
    setHeader(): void {},
    end(chunk?: unknown): void {
      if (typeof chunk === 'string') state.data = chunk
    },
  } as unknown as ServerResponse
  return { res, state }
}

beforeEach(() => {
  resetDailyMaterialRateLimitForTests()
  mockCreate.mockReset()
  process.env.DAILY_SECRET = 'secret'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('api/daily-material handler', () => {
  it('returns 405 for non-POST methods', async () => {
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody, 'secret', 'GET'), res)
    expect(state.status).toBe(405)
  })

  it('returns 401 when the passcode header does not match DAILY_SECRET', async () => {
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody, 'wrong'), res)
    expect(state.status).toBe(401)
  })

  it('returns 401 when DAILY_SECRET is not configured on the server', async () => {
    delete process.env.DAILY_SECRET
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody, 'secret'), res)
    expect(state.status).toBe(401)
  })

  it('returns 200 with the generated material on success', async () => {
    mockCreate.mockResolvedValueOnce(textResponse(validResponse))
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)
    expect(state.status).toBe(200)
    expect(JSON.parse(state.data)).toEqual(validResponse)
  })

  it('retries once when the first response fails to parse/validate, then succeeds', async () => {
    mockCreate.mockResolvedValueOnce(textResponse({ not: 'valid' }))
    mockCreate.mockResolvedValueOnce(textResponse(validResponse))

    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)

    expect(state.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('returns a 4xx with an error message (not a bare 500) when both attempts fail to parse', async () => {
    mockCreate.mockResolvedValue(textResponse({ not: 'valid' }))

    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)

    expect(state.status).toBeGreaterThanOrEqual(400)
    expect(state.status).toBeLessThan(500)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    const body = JSON.parse(state.data) as { error: string }
    expect(typeof body.error).toBe('string')
  })

  it('returns 429 once the daily generation limit is exceeded', async () => {
    mockCreate.mockResolvedValue(textResponse(validResponse))
    for (let i = 0; i < 5; i++) {
      const { res, state } = makeRes()
      await handler(makeReq(sampleBody), res)
      expect(state.status).toBe(200)
    }
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)
    expect(state.status).toBe(429)
  })

  it('filters out grammarNotes whose sentence is not a verbatim substring of the essay, keeping the rest, without retrying', async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({
        paragraphs: [[['今日は'], ['テスト', 'てすと'], ['です。']]],
        zh: '測試',
        comprehensionPoints: ['a', 'b', 'c'],
        grammarNotes: [
          { sentence: [['今日は'], ['テスト', 'てすと']], zh: '今天測試', grammarPoint: '真的有用到', explanation: '說明' },
          { sentence: [['造假的句子']], zh: '編造的翻譯', grammarPoint: '編造的', explanation: '說明' },
        ],
      }),
    )

    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)

    expect(state.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const body = JSON.parse(state.data) as { grammarNotes: { grammarPoint: string; zh: string }[] }
    expect(body.grammarNotes).toHaveLength(1)
    expect(body.grammarNotes[0].grammarPoint).toBe('真的有用到')
    expect(body.grammarNotes[0].zh).toBe('今天測試')
  })

  it('caps grammarNotes at 4 even when more survive verbatim filtering', async () => {
    const note = { sentence: [['テスト']], zh: '測試翻譯', grammarPoint: '點', explanation: '說明' }
    mockCreate.mockResolvedValueOnce(
      textResponse({
        paragraphs: [[['テスト']]],
        zh: '測試',
        comprehensionPoints: ['a', 'b', 'c'],
        grammarNotes: [note, note, note, note, note, note],
      }),
    )

    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)

    expect(state.status).toBe(200)
    const body = JSON.parse(state.data) as { grammarNotes: unknown[] }
    expect(body.grammarNotes).toHaveLength(4)
  })

  it('still succeeds (200) with an empty grammarNotes array when every note fails verbatim filtering', async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({
        paragraphs: [[['テスト']]],
        zh: '測試',
        comprehensionPoints: ['a', 'b', 'c'],
        grammarNotes: [{ sentence: [['完全編造']], zh: '無關翻譯', grammarPoint: '點', explanation: '說明' }],
      }),
    )

    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)

    expect(state.status).toBe(200)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const body = JSON.parse(state.data) as { grammarNotes: unknown[] }
    expect(body.grammarNotes).toEqual([])
  })

  it('resetDailyMaterialRateLimitForTests clears the counter between tests', async () => {
    mockCreate.mockResolvedValue(textResponse(validResponse))
    for (let i = 0; i < 5; i++) {
      const { res } = makeRes()
      await handler(makeReq(sampleBody), res)
    }
    resetDailyMaterialRateLimitForTests()
    const { res, state } = makeRes()
    await handler(makeReq(sampleBody), res)
    expect(state.status).toBe(200)
  })
})
