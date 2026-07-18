import { useState, type ChangeEvent } from 'react'
import { exportBackup, importBackup } from '../../db/backup.ts'
import { backupSchema, type BackupData } from '../../db/backupSchema.ts'

type ImportStage =
  | { type: 'idle' }
  | { type: 'error'; message: string }
  | { type: 'confirm'; data: BackupData }
  | { type: 'importing' }

export function BackupSection() {
  const [stage, setStage] = useState<ImportStage>({ type: 'idle' })

  async function handleExport() {
    const data = await exportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kotoba-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file again later
    if (!file) return

    try {
      const parsed = backupSchema.safeParse(JSON.parse(await file.text()))
      if (!parsed.success) {
        setStage({ type: 'error', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
        return
      }
      setStage({ type: 'confirm', data: parsed.data })
    } catch (err) {
      setStage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleConfirmImport() {
    if (stage.type !== 'confirm') return
    setStage({ type: 'importing' })
    await importBackup(stage.data)
    window.location.reload()
  }

  return (
    <section className="stats-section backup-section">
      <h2>資料備份</h2>
      <button type="button" className="backup-export-button" onClick={handleExport}>
        匯出備份
      </button>

      <label className="backup-import-button">
        匯入備份
        <input type="file" accept="application/json" onChange={handleFileSelected} />
      </label>

      {stage.type === 'error' && <p className="vocab-error-inline">匯入失敗：{stage.message}</p>}

      {stage.type === 'importing' && <p className="vocab-status">匯入成功，重新載入中…</p>}

      {stage.type === 'confirm' && (
        <div className="batch-add-overlay" role="dialog" aria-modal="true">
          <div className="batch-add-dialog">
            <p>此備份匯出於 {new Date(stage.data.exportedAt).toLocaleString('zh-Hant')}，包含：</p>
            <ul className="backup-confirm-list">
              <li>{stage.data.cards.length} 張卡片</li>
              <li>{stage.data.reviewLogs.length} 筆複習紀錄</li>
              <li>{stage.data.queuedItems.length} 筆待加入項目</li>
              <li>{stage.data.settings.length} 項設定</li>
            </ul>
            <p className="backup-warning">匯入將完全取代目前所有資料，現有進度將被清除且無法復原。</p>
            <div className="batch-add-actions">
              <button type="button" className="batch-add-cancel" onClick={() => setStage({ type: 'idle' })}>
                取消
              </button>
              <button type="button" className="batch-add-confirm" onClick={handleConfirmImport}>
                確認取代
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
