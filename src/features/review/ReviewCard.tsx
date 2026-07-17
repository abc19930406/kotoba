import type { VocabEntry, GrammarEntry } from '../../shared/contentTypes.ts'

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
  onFlip: () => void
}

const MAX_SENTENCES_SHOWN = 2

export function ReviewCard({ content, flipped, onFlip }: ReviewCardProps) {
  const front = content.itemType === 'vocab' ? content.entry.kanji : content.entry.title
  const sentences = content.entry.sentences.slice(0, MAX_SENTENCES_SHOWN)

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
                  <p className="jp">{s.jp}</p>
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
