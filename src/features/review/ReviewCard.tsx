import type { VocabEntry, GrammarEntry } from '../../shared/contentTypes.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'

interface VocabCardContent {
  itemType: 'vocab'
  entry: VocabEntry
}
interface GrammarCardContent {
  itemType: 'grammar'
  entry: GrammarEntry
}
export type ReviewCardContent = VocabCardContent | GrammarCardContent

interface ReviewCardProps {
  content: ReviewCardContent
  flipped: boolean
  showFurigana: boolean
  onFlip: () => void
}

// Vocab shows 2 sentences; grammar shows just 1, per Phase 4 spec ("翻面為意義+一句例句").
const MAX_SENTENCES_SHOWN: Record<ReviewCardContent['itemType'], number> = { vocab: 2, grammar: 1 }

export function ReviewCard({ content, flipped, showFurigana, onFlip }: ReviewCardProps) {
  const front = content.itemType === 'vocab' ? content.entry.kanji : content.entry.title
  const sentences = content.entry.sentences.slice(0, MAX_SENTENCES_SHOWN[content.itemType])

  return (
    <button type="button" className="review-card" onClick={onFlip} aria-pressed={flipped}>
      <div className="review-card-front">{front}</div>
      {flipped && (
        <div className="review-card-back">
          {content.itemType === 'vocab' ? <VocabBack entry={content.entry} /> : <GrammarBack entry={content.entry} />}
          {sentences.length > 0 && (
            <ul className="review-card-sentences">
              {sentences.map((s) => (
                <li key={s.jp}>
                  <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                  <p className="en">{s.en}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </button>
  )
}

function VocabBack({ entry }: { entry: VocabEntry }) {
  return (
    <div className="review-card-meaning">
      <p className="kana">{entry.kana}</p>
      {entry.usageNote && <p className="usage-note">{entry.usageNote}</p>}
      <p className="meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</p>
    </div>
  )
}

function GrammarBack({ entry }: { entry: GrammarEntry }) {
  return (
    <div className="review-card-meaning">
      <p className="formation">{entry.formation}</p>
      <p className="meaning">{entry.zhShort ?? entry.shortExplanation}</p>
    </div>
  )
}
