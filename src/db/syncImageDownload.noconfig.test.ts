import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('./supabase.ts', () => ({ supabase: null }))

const { downloadPendingImages } = await import('./syncImageDownload.ts')

beforeEach(async () => {
  await db.notes.clear()
  await db.noteImages.clear()
})

describe('downloadPendingImages (Supabase not configured)', () => {
  it('resolves without throwing and downloads nothing', async () => {
    await db.notes.add({ itemType: 'vocab', itemId: 'v1', text: '', updatedAt: new Date() })

    await expect(downloadPendingImages()).resolves.toBeUndefined()
    expect(await db.noteImages.count()).toBe(0)
  })
})
