import type { VocabEntry } from '../../shared/contentTypes.ts'

export function filterVocab(entries: VocabEntry[], search: string, selectedPos: Set<string>): VocabEntry[] {
  const query = search.trim().toLowerCase()

  return entries.filter((entry) => {
    if (selectedPos.size > 0 && !entry.partOfSpeech.some((p) => selectedPos.has(p))) {
      return false
    }
    if (query.length === 0) return true
    if (entry.kanji.includes(search.trim())) return true
    if (entry.kana.includes(search.trim())) return true
    if (entry.meaningZh?.toLowerCase().includes(query)) return true
    if (entry.meaningEn.some((m) => m.toLowerCase().includes(query))) return true
    return false
  })
}

/** Distinct POS codes present in `entries`, most frequent first. */
export function collectPosCodes(entries: VocabEntry[]): string[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const pos of entry.partOfSpeech) {
      counts.set(pos, (counts.get(pos) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code)
}
