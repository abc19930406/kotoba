import type { VocabEntry, JlptLevel } from '../../shared/contentTypes.ts'
import { pickDisplaySentences } from '../../shared/sortSentences.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { SpeakButton } from '../../shared/SpeakButton.tsx'

interface DailyPackageVocabItemProps {
  entry: VocabEntry
  currentLevel: JlptLevel
  showFurigana: boolean
}

/** Collapsed-by-default vocab summary card for the daily package — kanji/kana in the summary, a few example sentences when expanded. */
export function DailyPackageVocabItem({ entry, currentLevel, showFurigana }: DailyPackageVocabItemProps) {
  const sentences = pickDisplaySentences(entry.sentences, currentLevel)

  return (
    <details className="daily-package-item">
      <summary>
        {entry.kanji}（{entry.kana}）
      </summary>
      {sentences.length > 0 && (
        <ul className="daily-package-item-sentences">
          {sentences.map((s) => (
            <li key={s.jp}>
              <div className="sentence-jp-row">
                <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                <SpeakButton text={s.jp} />
              </div>
              {s.en && <p className="en">{s.en}</p>}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
