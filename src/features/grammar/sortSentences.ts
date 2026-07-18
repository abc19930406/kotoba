import { LEVEL_TO_DIFFICULTY, type GradedSentence, type JlptLevel } from '../../shared/contentTypes.ts'

/** Sorts a grammar point's example sentences so the one closest in difficulty to the user's current level comes first. Stable — ties keep their original order. */
export function sortSentencesByCurrentLevel(sentences: GradedSentence[], currentLevel: JlptLevel): GradedSentence[] {
  const target = LEVEL_TO_DIFFICULTY[currentLevel]
  return sentences.slice().sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target))
}
