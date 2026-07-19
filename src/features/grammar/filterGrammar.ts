import type { GrammarEntry } from '../../shared/contentTypes.ts'

export function filterGrammar(entries: GrammarEntry[], search: string): GrammarEntry[] {
  const query = search.trim().toLowerCase()
  if (query.length === 0) return entries

  return entries.filter((entry) => {
    if (entry.title.toLowerCase().includes(query)) return true
    if (entry.formation.toLowerCase().includes(query)) return true
    if (entry.zhShort?.toLowerCase().includes(query)) return true
    if (entry.shortExplanation.toLowerCase().includes(query)) return true
    return false
  })
}
