import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './schema.ts'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('./supabase.ts', () => ({ supabase: null }))

const { uploadPendingImages } = await import('./syncImageUpload.ts')

beforeEach(async () => {
  await db.noteImages.clear()
})

describe('uploadPendingImages (Supabase not configured)', () => {
  it('resolves without throwing and leaves the image pending', async () => {
    await db.noteImages.add({ noteKey: 'vocab:v1', blob: new Blob(['x']), sort: 0, remoteId: 'img-uuid-1' })

    await expect(uploadPendingImages()).resolves.toBeUndefined()

    const row = await db.noteImages.where('noteKey').equals('vocab:v1').first()
    expect(row!.storagePath).toBeUndefined()
  })
})
