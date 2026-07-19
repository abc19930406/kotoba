import { describe, expect, it } from 'vitest'
import { filterGrammar } from './filterGrammar.ts'
import type { GrammarEntry } from '../../shared/contentTypes.ts'

const entries: GrammarEntry[] = [
  {
    id: 'g1',
    level: 'N5',
    title: '～てください',
    formation: '動詞て形 + ください',
    shortExplanation: 'Polite request.',
    longExplanation: '',
    zhShort: '請～（禮貌請求）',
    zhLong: null,
    sentences: [],
  },
  {
    id: 'g2',
    level: 'N4',
    title: '～ばよかった',
    formation: '動詞ば形 + よかった',
    shortExplanation: 'Expresses regret.',
    longExplanation: '',
    zhShort: null,
    zhLong: null,
    sentences: [],
  },
  {
    id: 'g3',
    level: 'N3',
    title: '～わけではない',
    formation: '普通形 + わけではない',
    shortExplanation: 'Not necessarily the case.',
    longExplanation: '',
    zhShort: '並不是～',
    zhLong: null,
    sentences: [],
  },
]

describe('filterGrammar', () => {
  it('returns all entries when search is empty', () => {
    expect(filterGrammar(entries, '')).toHaveLength(3)
  })

  it('matches by title substring', () => {
    expect(filterGrammar(entries, 'てください').map((e) => e.id)).toEqual(['g1'])
  })

  it('matches by formation substring', () => {
    expect(filterGrammar(entries, 'ば形').map((e) => e.id)).toEqual(['g2'])
  })

  it('matches by zhShort substring', () => {
    expect(filterGrammar(entries, '並不是').map((e) => e.id)).toEqual(['g3'])
  })

  it('falls back to shortExplanation when zhShort is null', () => {
    expect(filterGrammar(entries, 'regret').map((e) => e.id)).toEqual(['g2'])
  })

  it('matches case-insensitively', () => {
    expect(filterGrammar(entries, 'POLITE').map((e) => e.id)).toEqual(['g1'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterGrammar(entries, '完全沒有這個字串')).toHaveLength(0)
  })
})
