import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { LEVEL_ORDER, type JlptLevel, type GrammarEntry } from './schemas.ts'
import { RAW_DIR } from './fetch.ts'
import { extractJsonArray, runPool, withRateLimitBackoff, requestWithParseRetry, type BatchUsage } from './llmBatch.ts'

const MODEL = 'claude-haiku-4-5'
const BATCH_SIZE = 20 // grammar entries carry far more text per item than vocab words
const CONCURRENCY = 4
const MAX_ATTEMPTS = 2 // 1 initial + 1 retry on parse failure
const PRICING_PER_MTOK = { input: 1, output: 5 } // claude-haiku-4-5

export const GRAMMAR_TRANSLATIONS_CACHE_PATH = path.join(RAW_DIR, 'translations-grammar.json')

export interface GrammarTranslation {
  zhShort: string
  zhLong: string
}
export type GrammarTranslationCache = Record<string, GrammarTranslation>

export async function loadGrammarTranslationCache(): Promise<GrammarTranslationCache> {
  try {
    const raw = await readFile(GRAMMAR_TRANSLATIONS_CACHE_PATH, 'utf-8')
    return JSON.parse(raw) as GrammarTranslationCache
  } catch {
    return {}
  }
}

async function saveGrammarTranslationCache(cache: GrammarTranslationCache): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true })
  await writeFile(GRAMMAR_TRANSLATIONS_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf-8')
}

interface GrammarTranslationInput {
  id: string
  title: string
  shortExplanation: string
  longExplanation: string
}

// Grammar ids embed the full title (Japanese + romaji, e.g.
// "N5-～（場所）に～があります (〜basho ni 〜 ga arimasu)") — long and easy for
// a model to subtly "clean up" while echoing back, which silently orphans the
// cache entry under a key that never matches. Vocab avoided this because its
// ids are short opaque GUIDs. Fix: never ask the model to reproduce the id —
// use a batch-local numeric index instead and map back to the real id here.
const SYSTEM_PROMPT = `你是專業的日文文法教材編輯，服務對象是台灣的日文學習者。
只輸出 JSON，不要有其他文字、不要用 markdown code fence、不要有任何說明。
輸出格式固定為 JSON 陣列，每個元素為 {"idx": 0, "zhShort": "...", "zhLong": "..."}，idx 為輸入項目的編號（原封不動抄錄，不要更動）。
zhShort 是 shortExplanation 的繁體中文翻譯（精簡的一句話文法說明）。
zhLong 是 longExplanation 的繁體中文翻譯（完整說明，可包含接續方式與用法細節）。
兩者都使用台灣日語學習者慣用的文法術語與語彙，語意需忠實對應原文，不要省略或過度簡化。`

function buildUserPrompt(items: GrammarTranslationInput[]): string {
  const lines = items.map((g, idx) =>
    JSON.stringify({ idx, title: g.title, shortExplanation: g.shortExplanation, longExplanation: g.longExplanation }),
  )
  return `為以下 ${items.length} 個日文文法點的說明各翻譯成繁體中文，輸出 JSON 陣列：\n${lines.join('\n')}`
}

function parseGrammarTranslations(text: string): Map<number, GrammarTranslation> {
  const parsed = extractJsonArray(text)
  if (!Array.isArray(parsed)) throw new Error('parsed JSON is not an array')
  const result = new Map<number, GrammarTranslation>()
  for (const item of parsed) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { idx?: unknown }).idx === 'number' &&
      typeof (item as { zhShort?: unknown }).zhShort === 'string' &&
      typeof (item as { zhLong?: unknown }).zhLong === 'string'
    ) {
      const { idx, zhShort, zhLong } = item as { idx: number; zhShort: string; zhLong: string }
      result.set(idx, { zhShort, zhLong })
    }
  }
  return result
}

async function requestBatch(
  client: Anthropic,
  items: GrammarTranslationInput[],
): Promise<{ result: Map<string, GrammarTranslation>; usage: BatchUsage }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(items) }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  const byIndex = parseGrammarTranslations(text)
  const byId = new Map<string, GrammarTranslation>()
  for (const [idx, translation] of byIndex) {
    const item = items[idx]
    if (item) byId.set(item.id, translation)
  }
  return {
    result: byId,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  }
}

export async function translateGrammarMissing(
  grammarByLevel: Record<JlptLevel, GrammarEntry[]>,
): Promise<GrammarTranslationCache> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set — put it in .env (see CLAUDE.md Phase 1b)')
  }
  const client = new Anthropic()
  const cache = await loadGrammarTranslationCache()

  const allItems: GrammarTranslationInput[] = LEVEL_ORDER.flatMap((level) =>
    grammarByLevel[level]
      .filter((g) => !cache[g.id])
      .map((g) => ({ id: g.id, title: g.title, shortExplanation: g.shortExplanation, longExplanation: g.longExplanation })),
  )

  if (allItems.length === 0) {
    console.log('translate-grammar: all grammar already cached, nothing to do')
    return cache
  }

  const batches: GrammarTranslationInput[][] = []
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    batches.push(allItems.slice(i, i + BATCH_SIZE))
  }
  console.log(
    `translate-grammar: ${allItems.length} grammar points missing translation, ${batches.length} batches of up to ${BATCH_SIZE}, concurrency ${CONCURRENCY}`,
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
    for (const [id, translation] of result) cache[id] = translation
    await saveGrammarTranslationCache(cache)
    completedBatches++
    console.log(`  batch ${completedBatches}/${batches.length} done (${result.size}/${batch.length} translated)`)
  })

  const cost = (totalInputTokens / 1_000_000) * PRICING_PER_MTOK.input + (totalOutputTokens / 1_000_000) * PRICING_PER_MTOK.output
  console.log(`translate-grammar: usage — input ${totalInputTokens} tokens, output ${totalOutputTokens} tokens`)
  console.log(`translate-grammar: estimated cost — $${cost.toFixed(4)} USD (model: ${MODEL})`)

  return cache
}
