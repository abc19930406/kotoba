import { describe, expect, it } from 'vitest'
import { filterVocab, collectPosCodes } from './filterVocab.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'

const entries: VocabEntry[] = [
  {
    id: 'v1',
    level: 'N5',
    kanji: '食べる',
    kana: 'たべる',
    usageNote: null,
    partOfSpeech: ['v1', 'vt'],
    meaningEn: ['to eat'],
    meaningZh: '吃',
    sentences: [],
  },
  {
    id: 'v2',
    level: 'N5',
    kanji: '飲む',
    kana: 'のむ',
    usageNote: null,
    partOfSpeech: ['v5m', 'vt'],
    meaningEn: ['to drink'],
    meaningZh: '喝',
    sentences: [],
  },
  {
    id: 'v3',
    level: 'N5',
    kanji: '大きい',
    kana: 'おおきい',
    usageNote: null,
    partOfSpeech: ['adj-i'],
    meaningEn: ['big'],
    meaningZh: null,
    sentences: [],
  },
]

describe('filterVocab', () => {
  it('returns all entries when search and POS filters are empty', () => {
    expect(filterVocab(entries, '', new Set())).toHaveLength(3)
  })

  it('matches by kanji substring', () => {
    expect(filterVocab(entries, '食', new Set()).map((e) => e.id)).toEqual(['v1'])
  })

  it('matches by kana substring', () => {
    expect(filterVocab(entries, 'のむ', new Set()).map((e) => e.id)).toEqual(['v2'])
  })

  it('matches by zh meaning', () => {
    expect(filterVocab(entries, '喝', new Set()).map((e) => e.id)).toEqual(['v2'])
  })

  it('matches by en meaning case-insensitively', () => {
    expect(filterVocab(entries, 'EAT', new Set()).map((e) => e.id)).toEqual(['v1'])
  })

  it('falls back to en meaning search when zh meaning is null', () => {
    expect(filterVocab(entries, 'big', new Set()).map((e) => e.id)).toEqual(['v3'])
  })

  it('filters by a single selected POS code', () => {
    expect(filterVocab(entries, '', new Set(['adj-i'])).map((e) => e.id)).toEqual(['v3'])
  })

  it('OR-matches across multiple selected POS codes', () => {
    const result = filterVocab(entries, '', new Set(['v1', 'adj-i']))
    expect(result.map((e) => e.id).sort()).toEqual(['v1', 'v3'])
  })

  it('combines search and POS filters with AND', () => {
    // v2 has vt and matches "drink"; v1 has vt but doesn't match "drink"
    expect(filterVocab(entries, 'drink', new Set(['vt'])).map((e) => e.id)).toEqual(['v2'])
  })
})

describe('collectPosCodes', () => {
  it('returns distinct codes ordered by frequency (most common first)', () => {
    // vt appears twice (v1, v2); v1/v5m/adj-i appear once each
    expect(collectPosCodes(entries)[0]).toBe('vt')
    expect(new Set(collectPosCodes(entries))).toEqual(new Set(['v1', 'vt', 'v5m', 'adj-i']))
  })
})
