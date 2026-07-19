import type { KeyboardEvent } from 'react'
import type { VocabEntry, GrammarEntry } from '../../shared/contentTypes.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { SpeakButton } from '../../shared/SpeakButton.tsx'
import { NoteDisclosure } from '../notes/NoteDisclosure.tsx'

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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onFlip()
    }
  }

  return (
    // Plain div, not <button> — the flipped-back content below needs to
    // contain real <button> SpeakButtons, and HTML forbids nesting buttons.
    // role="button" + tabIndex + onKeyDown restore the native button's
    // click/keyboard/accessible-name behavior that the element type alone
    // no longer provides for free.
    <div className="review-card" role="button" tabIndex={0} onClick={onFlip} onKeyDown={handleKeyDown} aria-pressed={flipped}>
      <div className="review-card-front">{front}</div>
      {flipped && (
        <div className="review-card-back">
          {content.itemType === 'vocab' ? <VocabBack entry={content.entry} /> : <GrammarBack entry={content.entry} />}
          <NoteDisclosure itemType={content.itemType} itemId={content.entry.id} />
          {sentences.length > 0 && (
            <ul className="review-card-sentences">
              {sentences.map((s) => (
                <li key={s.jp}>
                  <div className="sentence-jp-row">
                    <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                    <SpeakButton text={s.jp} />
                  </div>
                  <p className="en">{s.en}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function VocabBack({ entry }: { entry: VocabEntry }) {
  return (
    <div className="review-card-meaning">
      <div className="review-card-kana-row">
        <p className="kana">{entry.kana}</p>
        <SpeakButton text={entry.kana} label="播放單字發音" />
      </div>
      {entry.usageNote && <p className="usage-note">{entry.usageNote}</p>}
      <p className="meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</p>
    </div>
  )
}

function GrammarBack({ entry }: { entry: GrammarEntry }) {
  return (
    <div className="review-card-meaning">
      <div className="review-card-kana-row">
        <p className="formation">{entry.formation}</p>
        <SpeakButton text={entry.title} label={`播放「${entry.title}」發音`} />
      </div>
      <p className="meaning">{entry.zhShort ?? entry.shortExplanation}</p>
    </div>
  )
}
