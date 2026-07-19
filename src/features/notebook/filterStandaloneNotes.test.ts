import { describe, expect, it } from 'vitest'
import { filterStandaloneNotes } from './filterStandaloneNotes.ts'
import type { StandaloneNoteSummary } from '../../db/standaloneNotes.ts'

const notes: StandaloneNoteSummary[] = [
  { id: 1, title: '購物清單', text: '牛奶、雞蛋、麵包', updatedAt: new Date(), firstImage: null },
  { id: 2, title: '旅行計畫', text: '東京、京都', updatedAt: new Date(), firstImage: null },
  { id: 3, title: '雜記', text: '今天天氣不錯', updatedAt: new Date(), firstImage: null },
]

describe('filterStandaloneNotes', () => {
  it('returns all notes when search is empty', () => {
    expect(filterStandaloneNotes(notes, '')).toHaveLength(3)
  })

  it('matches by title substring', () => {
    expect(filterStandaloneNotes(notes, '購物').map((n) => n.id)).toEqual([1])
  })

  it('matches by text substring', () => {
    expect(filterStandaloneNotes(notes, '東京').map((n) => n.id)).toEqual([2])
  })

  it('matches case-insensitively', () => {
    const withEnglish: StandaloneNoteSummary[] = [
      { id: 4, title: 'Todo List', text: 'buy milk', updatedAt: new Date(), firstImage: null },
    ]
    expect(filterStandaloneNotes(withEnglish, 'TODO')).toHaveLength(1)
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterStandaloneNotes(notes, '完全沒有這個字串')).toHaveLength(0)
  })
})
