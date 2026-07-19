import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import {
  DAILY_PASSCODE_HEADER,
  type DailyMaterialRequestBody,
  type DailyMaterialResponseBody,
} from './dailyMaterialTypes.ts'

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' })
  }

  const passcode = req.headers.get(DAILY_PASSCODE_HEADER)
  if (!process.env.DAILY_SECRET || passcode !== process.env.DAILY_SECRET) {
    return jsonResponse(401, { error: '通行碼錯誤' })
  }

  const key = todayKey()
  const count = dailyCounts[key] ?? 0
  if (count >= DAILY_GENERATION_LIMIT) {
    return jsonResponse(429, { error: '已達今日生成次數上限' })
  }
  dailyCounts[key] = count + 1

  let body: DailyMaterialRequestBody
  try {
    body = (await req.json()) as DailyMaterialRequestBody
  } catch {
    return jsonResponse(400, { error: '請求格式錯誤' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, { error: '伺服器未設定 ANTHROPIC_API_KEY' })
  }

  const client = new Anthropic()
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await requestOnce(client, body)
      return jsonResponse(200, result)
    } catch (err) {
      lastError = err
    }
  }
  console.error('daily-material: generation failed after retries', lastError)
  return jsonResponse(422, { error: '生成失敗，請稍後再試' })
}
