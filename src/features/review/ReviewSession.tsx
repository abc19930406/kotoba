import { useEffect, useRef, useState } from 'react'
import type { Grade } from 'ts-fsrs'
import { buildReviewQueue, type QueueItem } from './queue.ts'
import { gradeItem, suspendCard, resumeCard, getShowFurigana, DEFAULT_SHOW_FURIGANA } from '../../db/cards.ts'
import type { ItemType } from '../../db/schema.ts'
import { findVocabEntry, findGrammarEntry } from '../../shared/contentLoader.ts'
import { ReviewCard, type ReviewCardContent } from './ReviewCard.tsx'
import { GradeButtons } from './GradeButtons.tsx'

interface ReviewSessionProps {
  onComplete: () => void
}

interface SuspendToastState {
  itemType: ItemType
  itemId: string
}

async function loadContent(item: QueueItem): Promise<ReviewCardContent | undefined> {
  if (item.itemType === 'vocab') {
    const entry = await findVocabEntry(item.level, item.itemId)
    return entry ? { itemType: 'vocab', entry } : undefined
  }
  const entry = await findGrammarEntry(item.level, item.itemId)
  return entry ? { itemType: 'grammar', entry } : undefined
}

function SuspendToast({ toast, onUndo }: { toast: SuspendToastState | null; onUndo: () => void }) {
  if (!toast) return null
  return (
    <p className="suspend-toast">
      已標記熟悉{' '}
      <button type="button" onClick={onUndo}>
        撤銷
      </button>
    </p>
  )
}

export function ReviewSession({ onComplete }: ReviewSessionProps) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [content, setContent] = useState<ReviewCardContent | null>(null)
  const [grading, setGrading] = useState(false)
  const [suspendToast, setSuspendToast] = useState<SuspendToastState | null>(null)
  const [showFurigana, setShowFurigana] = useState(DEFAULT_SHOW_FURIGANA)
  const toastTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    buildReviewQueue().then(setQueue)
    getShowFurigana().then(setShowFurigana)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  const currentItem = queue?.[currentIndex]

  useEffect(() => {
    if (!currentItem) {
      setContent(null)
      return
    }
    let cancelled = false
    loadContent(currentItem).then((c) => {
      if (!cancelled) setContent(c ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [currentItem])

  async function handleGrade(grade: Grade) {
    if (!currentItem || grading) return
    setGrading(true)
    await gradeItem(currentItem.itemType, currentItem.itemId, currentItem.level, grade)
    setGrading(false)
    setFlipped(false)
    setCurrentIndex((i) => i + 1)
  }

  async function handleSuspend() {
    if (!currentItem || grading) return
    setGrading(true)
    await suspendCard(currentItem.itemType, currentItem.itemId, currentItem.level)
    setGrading(false)

    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current)
    setSuspendToast({ itemType: currentItem.itemType, itemId: currentItem.itemId })
    toastTimeoutRef.current = window.setTimeout(() => setSuspendToast(null), 5000)

    setFlipped(false)
    setCurrentIndex((i) => i + 1)
  }

  async function handleUndoSuspend() {
    if (!suspendToast) return
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current)
    await resumeCard(suspendToast.itemType, suspendToast.itemId)
    setSuspendToast(null)
  }

  if (queue === null) {
    return (
      <>
        <SuspendToast toast={suspendToast} onUndo={handleUndoSuspend} />
        <p className="review-status">載入複習佇列中…</p>
      </>
    )
  }

  if (queue.length === 0) {
    return (
      <>
        <SuspendToast toast={suspendToast} onUndo={handleUndoSuspend} />
        <div className="review-complete">
          <p>目前沒有到期或新卡，今天複習完成了！</p>
          <button type="button" onClick={onComplete}>
            回首頁
          </button>
        </div>
      </>
    )
  }

  if (currentIndex >= queue.length) {
    return (
      <>
        <SuspendToast toast={suspendToast} onUndo={handleUndoSuspend} />
        <div className="review-complete">
          <p>本輪複習完成，共 {queue.length} 張卡片。</p>
          <button type="button" onClick={onComplete}>
            回首頁
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="review-session">
      <SuspendToast toast={suspendToast} onUndo={handleUndoSuspend} />
      <p className="review-progress">
        {currentIndex + 1} / {queue.length}
      </p>
      {content ? (
        <ReviewCard content={content} flipped={flipped} showFurigana={showFurigana} onFlip={() => setFlipped(true)} />
      ) : (
        <p className="review-status">載入卡片內容中…</p>
      )}
      {flipped && content && (
        <>
          <button type="button" className="suspend-link" onClick={handleSuspend} disabled={grading}>
            已熟悉，不再出現
          </button>
          <GradeButtons onGrade={handleGrade} />
        </>
      )}
    </div>
  )
}
