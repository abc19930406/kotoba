import { goBack } from '../../shared/backStack.ts'

interface DeleteNoteConfirmProps {
  onConfirm: () => void
  /** Shown in the confirmation message for clarity (e.g. a standalone note's title) — omit for the plain "這則筆記" wording used by vocab/grammar item notes. */
  summary?: string
}

/**
 * Caller must `pushLayer(onCancel)` right before rendering this (in the same
 * click handler that opens it) — matching BackupSection.tsx's import-confirm
 * dialog — so the system back gesture/button closes it too. Not done here
 * via a mount effect: React StrictMode double-invokes effects in dev, which
 * would push two history entries for one dialog open.
 */
export function DeleteNoteConfirm({ onConfirm, summary }: DeleteNoteConfirmProps) {
  return (
    <div className="batch-add-overlay" role="dialog" aria-modal="true">
      <div className="batch-add-dialog">
        <p>確定要刪除{summary ? `「${summary}」` : '這則筆記'}嗎？包含所有圖片，此操作無法復原。</p>
        <div className="batch-add-actions">
          <button type="button" className="batch-add-cancel" onClick={goBack}>
            取消
          </button>
          <button type="button" className="batch-add-confirm" onClick={onConfirm}>
            確定刪除
          </button>
        </div>
      </div>
    </div>
  )
}
