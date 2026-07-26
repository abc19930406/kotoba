import { useState } from 'react'
import { db } from '../../db/schema.ts'

/**
 * Temporary diagnostic tool for Phase C0 (cloud sync sizing) — read-only,
 * never mutates anything, never calls any external service. Deliberately
 * self-contained in this one file/folder so the whole thing (this file,
 * its test, and the two-line wiring in StatsPage.tsx) can be deleted
 * cleanly once the cloud sync evaluation is done.
 */

export interface TableCounts {
  cards: number
  reviewLogs: number
  queuedItems: number
  notes: number
  standaloneNotes: number
  settings: number
  noteImages: number
}

export interface DataInventoryResult {
  counts: TableCounts
  imageTotalBytes: number
  imageMaxBytes: number
  /** JSON.stringify of every table's rows except noteImages (images excluded per spec), measured in UTF-8 bytes. */
  jsonBytes: number
}

/**
 * Extracted as a pure function (plain sizes in, not Blob objects) so it's
 * directly unit-testable — fake-indexeddb under jsdom doesn't structured-clone
 * Blob values correctly (a documented test-environment gap, see
 * src/db/backup.test.ts), so a Blob's `.size` read back from a real Dexie
 * round-trip is unreliable in tests even though it works fine in real
 * browsers. Testing this math directly sidesteps that gap.
 */
export function summarizeBlobSizes(sizes: number[]): { total: number; max: number } {
  return {
    total: sizes.reduce((sum, size) => sum + size, 0),
    max: sizes.length > 0 ? Math.max(...sizes) : 0,
  }
}

export async function computeDataInventory(): Promise<DataInventoryResult> {
  const [cards, reviewLogs, queuedItems, notes, standaloneNotes, settings, noteImages] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.queuedItems.toArray(),
    db.notes.toArray(),
    db.standaloneNotes.toArray(),
    db.settings.toArray(),
    db.noteImages.toArray(),
  ])

  const { total: imageTotalBytes, max: imageMaxBytes } = summarizeBlobSizes(noteImages.map((row) => row.blob.size))

  const json = JSON.stringify({ cards, reviewLogs, queuedItems, notes, standaloneNotes, settings })
  const jsonBytes = new TextEncoder().encode(json).length

  return {
    counts: {
      cards: cards.length,
      reviewLogs: reviewLogs.length,
      queuedItems: queuedItems.length,
      notes: notes.length,
      standaloneNotes: standaloneNotes.length,
      settings: settings.length,
      noteImages: noteImages.length,
    },
    imageTotalBytes,
    imageMaxBytes,
    jsonBytes,
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function DataInventoryDebug() {
  const [result, setResult] = useState<DataInventoryResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRun() {
    setLoading(true)
    setResult(await computeDataInventory())
    setLoading(false)
  }

  return (
    <section className="data-inventory-debug">
      <h2>⚠️ DEBUG：資料盤點（臨時工具，之後會移除）</h2>
      <button type="button" onClick={handleRun} disabled={loading}>
        {loading ? '計算中…' : '執行資料盤點'}
      </button>

      {result && (
        <div className="data-inventory-result">
          <h3>各表筆數</h3>
          <ul>
            <li>cards：{result.counts.cards}</li>
            <li>reviewLogs：{result.counts.reviewLogs}</li>
            <li>queuedItems：{result.counts.queuedItems}</li>
            <li>notes：{result.counts.notes}</li>
            <li>standaloneNotes：{result.counts.standaloneNotes}</li>
            <li>settings：{result.counts.settings}</li>
            <li>noteImages：{result.counts.noteImages}</li>
          </ul>

          <h3>圖片（noteImages）</h3>
          <ul>
            <li>總張數：{result.counts.noteImages}</li>
            <li>總大小：{formatBytes(result.imageTotalBytes)}</li>
            <li>單張最大：{formatBytes(result.imageMaxBytes)}</li>
          </ul>

          <h3>全部資料（不含圖片）JSON 大小估計</h3>
          <p>{formatBytes(result.jsonBytes)}</p>
        </div>
      )}
    </section>
  )
}
