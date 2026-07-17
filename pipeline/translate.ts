import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { LEVEL_ORDER, type JlptLevel, type VocabEntry } from './schemas.ts'
import { RAW_DIR } from './fetch.ts'
import { extractJsonArray, runPool, withRateLimitBackoff, requestWithParseRetry, type BatchUsage } from './llmBatch.ts'

const MODEL = 'claude-sonnet-4-6'
const BATCH_SIZE = 50
const CONCURRENCY = 4
const MAX_ATTEMPTS = 2 // 1 initial + 1 retry on parse failure
const PRICING_PER_MTOK = { input: 3, output: 15 } // claude-sonnet-4-6

export const TRANSLATIONS_CACHE_PATH = path.join(RAW_DIR, 'translations.json')

export type TranslationCache = Record<string, string>

export async function loadTranslationCache(): Promise<TranslationCache> {
  try {
    const raw = await readFile(TRANSLATIONS_CACHE_PATH, 'utf-8')
    return JSON.parse(raw) as TranslationCache
  } catch {
    return {}
  }
}

async function saveTranslationCache(cache: TranslationCache): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true })
  await writeFile(TRANSLATIONS_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8')
}

interface TranslationInput {
  id: string
  kanji: string
  kana: string
  partOfSpeech: string[]
  meaningEn: string[]
}

const SYSTEM_PROMPT = `你是專業的日文－繁體中文辭典編輯，服務對象是台灣的日文學習者。
只輸出 JSON，不要有其他文字、不要用 markdown code fence、不要有任何說明。
輸出格式固定為 JSON 陣列，每個元素為 {"id": "...", "zh": "..."}，zh 為精簡的繁體中文釋義（不超過 15 個字），使用台灣慣用語彙。`

function buildUserPrompt(words: TranslationInput[]): string {
  const lines = words.map((w) =>
    JSON.stringify({ id: w.id, kanji: w.kanji, kana: w.kana, pos: w.partOfSpeech, en: w.meaningEn }),
  )
  return `為以下 ${words.length} 個日文單字各生成一個精簡繁體中文釋義，輸出 JSON 陣列：\n${lines.join('\n')}`
}

function parseTranslations(text: string): Map<string, string> {
  const parsed = extractJsonArray(text)
  if (!Array.isArray(parsed)) throw new Error('parsed JSON is not an array')
  const result = new Map<string, string>()
  for (const item of parsed) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { zh?: unknown }).zh === 'string'
    ) {
      result.set((item as { id: string }).id, (item as { zh: string }).zh)
    }
  }
  return result
}

async function requestBatch(
  client: Anthropic,
  words: TranslationInput[],
): Promise<{ result: Map<string, string>; usage: BatchUsage }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: buildUserPrompt(words) }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  return {
    result: parseTranslations(text),
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  }
}

export async function translateMissing(vocabByLevel: Record<JlptLevel, VocabEntry[]>): Promise<TranslationCache> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — put it in .env (see CLAUDE.md Phase 1b)')
  }
  const client = new Anthropic()
  const cache = await loadTranslationCache()

  const allWords: TranslationInput[] = LEVEL_ORDER.flatMap((level) =>
    vocabByLevel[level]
      .filter((v) => !cache[v.id])
      .map((v) => ({ id: v.id, kanji: v.kanji, kana: v.kana, partOfSpeech: v.partOfSpeech, meaningEn: v.meaningEn })),
  )

  if (allWords.length === 0) {
    console.log('translate: all vocab already cached, nothing to do')
    return cache
  }

  const batches: TranslationInput[][] = []
  for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
    batches.push(allWords.slice(i, i + BATCH_SIZE))
  }
  console.log(
    `translate: ${allWords.length} words missing translation, ${batches.length} batches of up to ${BATCH_SIZE}, concurrency ${CONCURRENCY}`,
  )

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let completedBatches = 0

  await runPool(batches, CONCURRENCY, async (batch) => {
    const { result, usage } = await withRateLimitBackoff(() =>
      requestWithParseRetry(() => requestBatch(client, batch), MAX_ATTEMPTS, batch.length),
    )
    totalInputTokens += usage.inputTokens
    totalOutputTokens += usage.outputTokens
    for (const [id, zh] of result) cache[id] = zh
    await saveTranslationCache(cache)
    completedBatches++
    console.log(`  batch ${completedBatches}/${batches.length} done (${result.size}/${batch.length} translated)`)
  })

  const cost = (totalInputTokens / 1_000_000) * PRICING_PER_MTOK.input + (totalOutputTokens / 1_000_000) * PRICING_PER_MTOK.output
  console.log(`translate: usage — input ${totalInputTokens} tokens, output ${totalOutputTokens} tokens`)
  console.log(`translate: estimated cost — $${cost.toFixed(4)} USD (model: ${MODEL})`)

  return cache
}
