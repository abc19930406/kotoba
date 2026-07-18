import { describe, expect, it, vi } from 'vitest'
import type { JlptLevel, VocabEntry, GrammarEntry, GradedSentence } from './schemas.ts'

let convertCallCount = 0
vi.mock('kuroshiro', () => ({
  default: {
    default: class MockKuroshiro {
      async init() {}
      async convert(jp: string) {
        convertCallCount++
        if (jp === 'CRASH ME') throw new Error('str is not iterable')
        return `<ruby>${jp[0]}<rp>(</rp><rt>よみ</rt><rp>)</rp></ruby>${jp.slice(1)}`
      }
    },
  },
}))

vi.mock('kuroshiro-analyzer-kuromoji', () => ({
  default: class MockAnalyzer {
    async init() {}
  },
}))

const { addFurigana, parseFuriganaHtml } = await import('./furigana.ts')

describe('parseFuriganaHtml', () => {
  it('parses a mix of ruby-annotated and plain segments in order', () => {
    const html =
      '<ruby>図書館<rp>(</rp><rt>としょかん</rt><rp>)</rp></ruby>にたくさんの<ruby>本<rp>(</rp><rt>ほん</rt><rp>)</rp></ruby>があります。'
    const original = '図書館にたくさんの本があります。'
    expect(parseFuriganaHtml(html, original)).toEqual([
      ['図書館', 'としょかん'],
      ['にたくさんの'],
      ['本', 'ほん'],
      ['があります。'],
    ])
  })

  it('returns a single plain segment for text with no kanji at all', () => {
    const html = 'これはテストです。'
    expect(parseFuriganaHtml(html, html)).toEqual([['これはテストです。']])
  })

  it('falls back to a single unannotated segment when reconstruction does not match the original', () => {
    const html = '<ruby>本<rp>(</rp><rt>ほん</rt><rp>)</rp></ruby>garbled'
    const original = '本entirely different sentence'
    expect(parseFuriganaHtml(html, original)).toEqual([[original]])
  })
})

function emptyLevels<T>(): Record<JlptLevel, T[]> {
  return { N5: [], N4: [], N3: [], N2: [], N1: [] }
}

function makeVocabEntry(id: string, sentences: GradedSentence[]): VocabEntry {
  return {
    id,
    level: 'N5',
    kanji: id,
    kana: id,
    usageNote: null,
    partOfSpeech: [],
    meaningEn: ['x'],
    meaningZh: null,
    sentences,
  }
}

function makeSentence(jp: string): GradedSentence {
  return { jp, en: 'x', difficulty: 1, jpSegments: [] }
}

function makeLinkedData(vocabSentences: GradedSentence[][]) {
  const vocab = emptyLevels<VocabEntry>()
  vocab.N5 = vocabSentences.map((sentences, i) => makeVocabEntry(`v${i}`, sentences))
  const grammar = emptyLevels<GrammarEntry>()
  return {
    vocab,
    grammar,
    gradedSentences: new Map(),
    grade: () => ({ difficulty: 1, label: 'N5', words: [], tokenCount: 0 }),
  }
}

describe('addFurigana', () => {
  it('fills in jpSegments for every sentence', async () => {
    const linked = makeLinkedData([[makeSentence('食べる。')], [makeSentence('飲む。')]])
    await addFurigana(linked)
    expect(linked.vocab.N5[0].sentences[0].jpSegments).toEqual([
      ['食', 'よみ'],
      ['べる。'],
    ])
    expect(linked.vocab.N5[1].sentences[0].jpSegments).toEqual([
      ['飲', 'よみ'],
      ['む。'],
    ])
  })

  it('caches by jp text — the same sentence shared across entries converts only once', async () => {
    convertCallCount = 0
    const shared = '食べる。'
    const linked = makeLinkedData([[makeSentence(shared)], [makeSentence(shared)], [makeSentence(shared)]])
    await addFurigana(linked)
    expect(convertCallCount).toBe(1)
    expect(linked.vocab.N5[0].sentences[0].jpSegments).toEqual(linked.vocab.N5[2].sentences[0].jpSegments)
  })

  it('falls back to a single unannotated segment when kuroshiro throws on a sentence', async () => {
    const linked = makeLinkedData([[makeSentence('CRASH ME')]])
    await addFurigana(linked)
    expect(linked.vocab.N5[0].sentences[0].jpSegments).toEqual([['CRASH ME']])
  })

  it('is idempotent: running it twice on equivalent input produces identical jpSegments', async () => {
    const a = makeLinkedData([[makeSentence('図書館にあります。')]])
    const b = makeLinkedData([[makeSentence('図書館にあります。')]])
    await addFurigana(a)
    await addFurigana(b)
    expect(a.vocab.N5[0].sentences[0].jpSegments).toEqual(b.vocab.N5[0].sentences[0].jpSegments)
  })
})
