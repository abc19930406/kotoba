interface BatchAddConfirmProps {
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function BatchAddConfirm({ count, onConfirm, onCancel }: BatchAddConfirmProps) {
  return (
    <div className="batch-add-overlay" role="dialog" aria-modal="true">
      <div className="batch-add-dialog">
        <p>
          確定要將目前篩選出的 {count} 個單字全部加入複習佇列嗎？
        </p>
        <div className="batch-add-actions">
          <button type="button" className="batch-add-cancel" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="batch-add-confirm" onClick={onConfirm}>
            確定加入
          </button>
        </div>
      </div>
    </div>
  )
}
