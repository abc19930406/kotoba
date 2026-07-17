import Anthropic from '@anthropic-ai/sdk'

export interface BatchUsage {
  inputTokens: number
  outputTokens: number
}

export const ZERO_USAGE: BatchUsage = { inputTokens: 0, outputTokens: 0 }

export function addUsage(a: BatchUsage, b: BatchUsage): BatchUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens }
}

/** Claude sometimes wraps JSON in prose or a code fence despite instructions — pull out the array. */
export function extractJsonArray(text: string): unknown {
  const trimmed = text.trim()
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('response contains no JSON array')
  }
  return JSON.parse(trimmed.slice(start, end + 1))
}

export async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
}

export async function withRateLimitBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let delayMs = 2000
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < 5) {
        console.warn(`  rate limited, backing off ${delayMs}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        delayMs *= 2
        continue
      }
      throw err
    }
  }
}

/**
 * Retries a batch request when it parses to zero usable results (empty/malformed
 * JSON), up to maxAttempts total. A partially-successful batch (size > 0) is
 * accepted immediately rather than retried.
 */
export async function requestWithParseRetry<R>(
  request: () => Promise<{ result: Map<string, R>; usage: BatchUsage }>,
  maxAttempts: number,
  itemCountForLogging: number,
): Promise<{ result: Map<string, R>; usage: BatchUsage }> {
  let totalUsage = ZERO_USAGE
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { result, usage } = await request()
    totalUsage = addUsage(totalUsage, usage)
    if (result.size > 0) return { result, usage: totalUsage }
    console.warn(`  batch produced no usable results (attempt ${attempt}/${maxAttempts})`)
  }
  console.error(`  batch giving up after ${maxAttempts} attempts, skipping ${itemCountForLogging} items`)
  return { result: new Map(), usage: totalUsage }
}
