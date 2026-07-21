import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'

// This file is deliberately fully self-contained (no relative imports) —
// Vercel's Node function builder compiles api/*.ts per-file but leaves
// import specifiers untouched, so this project's `.ts`-extension import
// convention (fine under Vite/Vitest) fails at runtime on Vercel with
// ERR_MODULE_NOT_FOUND. The shapes below mirror
// src/shared/dailyMaterialTypes.ts and contentTypes.ts's FuriganaSegment/
// JlptLevel; both sides are small and stable, so the duplication is a
// deliberate trade-off. Keep them in sync if either ever changes.
//
// The handler uses the Node-style (req, res) signature: Vercel's Node
// runtime invokes default exports with IncomingMessage/ServerResponse
// (confirmed via production logs — a Web-standard Request handler crashed
// with "req.headers.get is not a function").

export type FuriganaSegment = [string] | [string, string]
export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1'

export interface DailyMaterialRequestBody {
  level: JlptLevel
  knownWords: { kanji: string; kana: string }[]
  newWords: { kanji: string; kana: string }[]
}

export interface DailyMaterialResponseBody {
  paragraphs: FuriganaSegment[][]
  zh: string
  comprehensionPoints: string[]
}

export const DAILY_PASSCODE_HEADER = 'X-Daily-Passcode'

const MODEL = 'claude-sonnet-4-6'
const MAX_ATTEMPTS = 2 // 1 initial + 1 retry on parse/validation failure
const DAILY_GENERATION_LIMIT = 5

const furiganaSegmentSchema = z.union([z.tuple([z.string()]), z.tuple([z.string(), z.string()])])

const responseSchema = z.object({
  paragraphs: z.array(z.array(furiganaSegmentSchema)).min(1),
  zh: z.string().min(1),
  comprehensionPoints: z.array(z.string()).length(3),
})

// Best-effort only — resets on serverless cold start, so this is a guard
// against accidental runaway usage, not a hard/reliable daily cap. The
// authoritative daily cap for regeneration is the client-side IndexedDB
// counter (see src/db/dailyMaterialCache.ts).
let dailyCounts: Record<string, number> = {}

export function resetDailyMaterialRateLimitForTests(): void {
  dailyCounts = {}
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

const SYSTEM_PROMPT = `你是專業的日文短文寫作老師，服務對象是台灣的日文學習者。
只輸出 JSON，不要有其他文字、不要用 markdown code fence、不要有任何說明。
輸出格式固定為一個 JSON 物件：
{
  "paragraphs": [ [ ["純文字片段"], ["漢字片段","讀音"], ... ], ... ],
  "zh": "整篇的繁體中文翻譯",
  "comprehensionPoints": ["讀解要點1", "讀解要點2", "讀解要點3"]
}
paragraphs 是段落陣列，每個段落是「片段」陣列——每個片段若不含漢字就只有一個元素
[純文字]，若含漢字則為 [漢字片段, 讀音（平假名）]；同一段落所有片段依序拼接第一個
元素後必須完全等於該段落的原文，不可省略或調換順序。comprehensionPoints 必須剛好
3 個。`

function buildUserPrompt(body: DailyMaterialRequestBody): string {
  const known = body.knownWords.map((w) => `${w.kanji}(${w.kana})`).join('、')
  const fresh = body.newWords.map((w) => `${w.kanji}(${w.kana})`).join('、')
  return `請以 JLPT ${body.level} 為難度上限，寫一篇 150–250 字的日文短文。
優先使用以下「已學單字」（若列表為空可自由選字但仍須符合等級難度）：
${known || '（無）'}
並自然帶入以下「今日新字」：
${fresh || '（無）'}
輸出符合系統提示格式的 JSON。`
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('response contains no JSON object')
  }
  return JSON.parse(trimmed.slice(start, end + 1))
}

async function requestOnce(client: Anthropic, body: DailyMaterialRequestBody): Promise<DailyMaterialResponseBody> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: buildUserPrompt(body) }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  return responseSchema.parse(extractJsonObject(text))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  // Vercel's Node bridge may have already consumed the stream and attached
  // the parsed body — prefer that when present, else read the raw stream.
  const preParsed = (req as IncomingMessage & { body?: unknown }).body
  if (preParsed !== undefined) {
    return typeof preParsed === 'string' ? JSON.parse(preParsed) : preParsed
  }
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  const passcode = headerValue(req, DAILY_PASSCODE_HEADER)
  if (!process.env.DAILY_SECRET || passcode !== process.env.DAILY_SECRET) {
    sendJson(res, 401, { error: '通行碼錯誤' })
    return
  }

  const key = todayKey()
  const count = dailyCounts[key] ?? 0
  if (count >= DAILY_GENERATION_LIMIT) {
    sendJson(res, 429, { error: '已達今日生成次數上限' })
    return
  }
  dailyCounts[key] = count + 1

  let body: DailyMaterialRequestBody
  try {
    body = (await readJsonBody(req)) as DailyMaterialRequestBody
  } catch {
    sendJson(res, 400, { error: '請求格式錯誤' })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(res, 500, { error: '伺服器未設定 ANTHROPIC_API_KEY' })
    return
  }

  const client = new Anthropic()
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await requestOnce(client, body)
      sendJson(res, 200, result)
      return
    } catch (err) {
      lastError = err
    }
  }
  console.error('daily-material: generation failed after retries', lastError)
  sendJson(res, 422, { error: '生成失敗，請稍後再試' })
}
