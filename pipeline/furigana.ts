import KuroshiroPkg from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'
import path from 'node:path'
import { LEVEL_ORDER, type FuriganaSegment } from './schemas.ts'
import type { LinkedData } from './link.ts'

const Kuroshiro = KuroshiroPkg.default

const RUBY_TAG = /<ruby>([^<]*)<rp>\(<\/rp><rt>([^<]*)<\/rt><rp>\)<\/rp><\/ruby>/g

/**
 * Parses kuroshiro's `mode: 'furigana'` HTML output into a compact segment
 * array: `[text]` for plain spans, `[text, reading]` for kanji spans. Sanity
 * checks that the segments' text reconstructs the original sentence exactly
 * — if the regex-based parse ever produces something that doesn't round-trip
 * (e.g. unexpected markup shape), falls back to a single unannotated segment
 * rather than shipping a mismatched result.
 */
export function parseFuriganaHtml(html: string, originalJp: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = []
  let lastIndex = 0
  RUBY_TAG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RUBY_TAG.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const plain = html.slice(lastIndex, match.index)
      if (plain) segments.push([plain])
    }
    segments.push([match[1], match[2]])
    lastIndex = RUBY_TAG.lastIndex
  }
  if (lastIndex < html.length) {
    const plain = html.slice(lastIndex)
    if (plain) segments.push([plain])
  }

  const reconstructed = segments.map((s) => s[0]).join('')
  if (segments.length === 0 || reconstructed !== originalJp) {
    return [[originalJp]]
  }
  return segments
}

/**
 * Fills in `jpSegments` on every example sentence across vocab and grammar,
 * mutating in place. The same Japanese sentence text is shared across many
 * vocab/grammar entries, so conversions are cached by `jp` text — this both
 * avoids redundant kuroshiro calls and is what keeps the step idempotent:
 * the same input text with a fixed dictionary always converts to the same
 * output, so reruns are byte-identical.
 */
export async function addFurigana(linked: LinkedData): Promise<void> {
  const kuroshiro = new Kuroshiro()
  await kuroshiro.init(
    new KuromojiAnalyzer({ dictPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') }),
  )

  const cache = new Map<string, FuriganaSegment[]>()
  let failureCount = 0
  async function segmentsFor(jp: string): Promise<FuriganaSegment[]> {
    const cached = cache.get(jp)
    if (cached) return cached
    let segments: FuriganaSegment[]
    try {
      const html = await kuroshiro.convert(jp, { mode: 'furigana', to: 'hiragana' })
      segments = parseFuriganaHtml(html, jp)
    } catch (err) {
      // kuroshiro/kuromoji occasionally throws on specific inputs (observed:
      // "str is not iterable" from its internal toRawHiragana on certain
      // tokens) — a known-limitation edge case, not something this pipeline
      // can fix. Fall back to a single unannotated segment (no furigana)
      // rather than aborting the whole run over one sentence.
      failureCount++
      console.warn(
        `furigana: conversion failed for "${jp}" (${err instanceof Error ? err.message : String(err)}), falling back to plain text`,
      )
      segments = [[jp]]
    }
    cache.set(jp, segments)
    return segments
  }

  const allSentences = [
    ...LEVEL_ORDER.flatMap((level) => linked.vocab[level].flatMap((v) => v.sentences)),
    ...LEVEL_ORDER.flatMap((level) => linked.grammar[level].flatMap((g) => g.sentences)),
  ]
  const uniqueCount = new Set(allSentences.map((s) => s.jp)).size
  console.log(`furigana: converting ${uniqueCount} unique sentences (${allSentences.length} slots)...`)

  let done = 0
  for (const sentence of allSentences) {
    sentence.jpSegments = await segmentsFor(sentence.jp)
    done++
    if (done % 1000 === 0) console.log(`furigana: ${done}/${allSentences.length} slots processed`)
  }
  console.log(
    `furigana: done (${cache.size} unique conversions, ${allSentences.length} slots filled, ${failureCount} fell back to plain text)`,
  )
}
