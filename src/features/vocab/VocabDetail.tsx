import { posLabel } from '../../shared/posLabels.ts'
import type { VocabEntry } from '../../shared/contentTypes.ts'
import type { ItemStatus } from '../../db/cards.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { SpeakButton } from '../../shared/SpeakButton.tsx'
import { NoteSection } from '../notes/NoteSection.tsx'

interface VocabDetailProps {
  entry: VocabEntry
  status: ItemStatus | 'none'
  showFurigana: boolean
  onAdd: () => void
  onToggleSuspend: () => void
  onBack: () => void
}

export function VocabDetail({ entry, status, showFurigana, onAdd, onToggleSuspend, onBack }: VocabDetailProps) {
  const addLabel = status === 'none' ? '加入複習' : status === 'suspended' ? '已熟悉' : '已加入複習'

  return (
    <div className="vocab-detail">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 返回列表
      </button>

      <div className="vocab-detail-kanji-row">
        <h2 className="vocab-detail-kanji">{entry.kanji}</h2>
        <SpeakButton text={entry.kana} label="播放單字發音" context="word" />
      </div>
      <p className="vocab-detail-kana">{entry.kana}</p>
      {entry.usageNote && <p className="vocab-detail-usage-note">{entry.usageNote}</p>}

      {entry.partOfSpeech.length > 0 && (
        <div className="vocab-detail-pos">
          {entry.partOfSpeech.map((p) => (
            <span key={p} className="pos-chip">
              {posLabel(p)}
            </span>
          ))}
        </div>
      )}

      <p className="vocab-detail-meaning">{entry.meaningZh ?? entry.meaningEn.join('；')}</p>
      {entry.meaningZh && <p className="vocab-detail-meaning-en">{entry.meaningEn.join('; ')}</p>}

      <button type="button" className="vocab-add-button" onClick={onAdd} disabled={status !== 'none'}>
        {addLabel}
      </button>

      {status !== 'none' && (
        <button type="button" className="vocab-suspend-toggle" onClick={onToggleSuspend}>
          {status === 'suspended' ? '恢復複習' : '標記已熟悉'}
        </button>
      )}

      {entry.sentences.length > 0 && (
        <div className="vocab-detail-sentences">
          <h3>例句</h3>
          <ul>
            {entry.sentences.map((s) => (
              <li key={s.jp}>
                <span className="sentence-difficulty">{s.difficulty >= 6 ? 'N1+' : `L${s.difficulty}`}</span>
                <div className="sentence-jp-row">
                  <JapaneseSentence jpSegments={s.jpSegments} showFurigana={showFurigana} className="jp" />
                  <SpeakButton text={s.jp} />
                </div>
                <p className="en">{s.en}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NoteSection itemType="vocab" itemId={entry.id} />
    </div>
  )
}
