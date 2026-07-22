import type { GrammarEntry, JlptLevel } from '../../shared/contentTypes.ts'
import { pickDisplaySentences } from '../../shared/sortSentences.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { SpeakButton } from '../../shared/SpeakButton.tsx'

interface DailyPackageGrammarItemProps {
  entry: GrammarEntry
  currentLevel: JlptLevel
  showFurigana: boolean
}

/** Collapsed-by-default grammar summary card for the daily package — title in the summary, formation/explanation/example sentences when expanded. */
export function DailyPackageGrammarItem({ entry, currentLevel, showFurigana }: DailyPackageGrammarItemProps) {
  const sentences = pickDisplaySentences(entry.sentences, currentLevel)

  return (
    <details className="daily-package-item">
      <summary>{entry.title}</summary>
      <p className="daily-package-item-formation">{entry.formation}</p>
      <p className="daily-package-item-meaning">{entry.zhShort ?? entry.shortExplanation}</p>
      {entry.zhLong && <p className="daily-package-item-long">{entry.zhLong}</p>}
      {sentences.length > 0 && (
        <ul className="daily-package-item-sentences">
          {sentences.map((s) => (
            <li key={s.jp}>
              <div className="sentence-jp-row">
                <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                <SpeakButton text={s.jp} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
