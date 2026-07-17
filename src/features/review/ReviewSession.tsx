import { useEffect, useState } from 'react'
import type { Grade } from 'ts-fsrs'
import { buildReviewQueue, type QueueItem } from './queue.ts'
import { gradeItem } from '../../db/cards.ts'
import { findVocabEntry, findGrammarEntry } from '../../shared/contentLoader.ts'
import { ReviewCard, type ReviewCardContent } from './ReviewCard.tsx'
import { GradeButtons } from './GradeButtons.tsx'

interface ReviewSessionProps {
  onComplete: () => void
}

async function loadContent(item: QueueItem): Promise<ReviewCardContent | undefined> {
  if (item.itemType === 'vocab') {
    const entry = await findVocabEntry(item.level, item.itemId)
    return entry ? { itemType: 'vocab', entry } : undefined
  }
  const entry = await findGrammarEntry(item.level, item.itemId)
  return entry ? { itemType: 'grammar', entry } : undefined
}

export function ReviewSession({ onComplete }: ReviewSessionProps) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [content, setContent] = useState<ReviewCardContent | null>(null)
  const [grading, setGrading] = useState(false)

  useEffect(() => {
    buildReviewQueue().then(setQueue)
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

  if (queue === null) {
    return <p className="review-status">載入複習佇列中…</p>
  }

  if (queue.length === 0) {
    return (
      <div className="review-complete">
        <p>目前沒有到期或新卡，今天複習完成了！</p>
        <button type="button" onClick={onComplete}>
          回首頁
        </button>
      </div>
    )
  }

  if (currentIndex >= queue.length) {
    return (
      <div className="review-complete">
        <p>本輪複習完成，共 {queue.length} 張卡片。</p>
        <button type="button" onClick={onComplete}>
          回首頁
        </button>
      </div>
    )
  }

  async function handleGrade(grade: Grade) {
    if (!currentItem || grading) return
    setGrading(true)
    await gradeItem(currentItem.itemType, currentItem.itemId, currentItem.level, grade)
    setGrading(false)
    setFlipped(false)
    setCurrentIndex((i) => i + 1)
  }

  return (
    <div className="review-session">
      <p className="review-progress">
        {currentIndex + 1} / {queue.length}
      </p>
      {content ? (
        <ReviewCard content={content} flipped={flipped} onFlip={() => setFlipped(true)} />
      ) : (
        <p className="review-status">載入卡片內容中…</p>
      )}
      {flipped && content && <GradeButtons onGrade={handleGrade} />}
    </div>
  )
}
