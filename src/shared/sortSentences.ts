import { LEVEL_TO_DIFFICULTY, type GradedSentence, type JlptLevel } from './contentTypes.ts'

/** Sorts a vocab/grammar item's example sentences so the one closest in difficulty to the user's current level comes first. Stable — ties keep their original order. */
export function sortSentencesByCurrentLevel(sentences: GradedSentence[], currentLevel: JlptLevel): GradedSentence[] {
  const target = LEVEL_TO_DIFFICULTY[currentLevel]
  return sentences.slice().sort((a, b) => Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target))
}

/** The `count` sentences closest in difficulty to the current level, for compact summary displays. */
export function pickDisplaySentences(sentences: GradedSentence[], currentLevel: JlptLevel, count = 3): GradedSentence[] {
  return sortSentencesByCurrentLevel(sentences, currentLevel).slice(0, count)
}
