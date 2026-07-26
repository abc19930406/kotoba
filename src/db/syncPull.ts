import { db, type ItemType } from './schema.ts'
import { supabase } from './supabase.ts'
import { CLOUD_TABLE } from './syncShared.ts'
import type { JlptLevel } from '../shared/contentTypes.ts'

type RemoteRow = Record<string, unknown>

async function fetchAll(table: string): Promise<RemoteRow[]> {
  const { data, error } = await supabase!.from(table).select('*')
  if (error) throw error
  return (data ?? []) as RemoteRow[]
}

async function pullCards(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.cards)) {
      const itemType = remote.item_type as ItemType
      const itemId = remote.item_id as string
      const local = await db.cards.get([itemType, itemId])
      const remoteUpdatedAt = new Date(remote.updated_at as string)
      if (local && remoteUpdatedAt <= local.updatedAt) continue
      await db.cards.put({
        itemId,
        itemType,
        level: remote.level as JlptLevel,
        due: new Date(remote.due as string),
        stability: remote.stability as number,
        difficulty: remote.difficulty as number,
        elapsed_days: remote.elapsed_days as number,
        scheduled_days: remote.scheduled_days as number,
        learning_steps: remote.learning_steps as number,
        reps: remote.reps as number,
        lapses: remote.lapses as number,
        state: remote.state as number,
        last_review: remote.last_review ? new Date(remote.last_review as string) : undefined,
        suspended: remote.suspended as boolean,
        updatedAt: remoteUpdatedAt,
      })
      // Deliberately not calling enqueueSync — this write came FROM the
      // cloud; re-queuing it to push right back would loop forever.
    }
  } catch {
    // Leave local cards untouched — retried on the next pull trigger.
  }
}

async function pullQueuedItems(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.queuedItems)) {
      const itemType = remote.item_type as ItemType
      const itemId = remote.item_id as string
      const local = await db.queuedItems.get([itemType, itemId])
      const remoteUpdatedAt = new Date(remote.updated_at as string)
      if (local && remoteUpdatedAt <= local.addedAt) continue
      await db.queuedItems.put({ itemId, itemType, level: remote.level as JlptLevel, addedAt: remoteUpdatedAt })
    }
  } catch {
    // Leave local queuedItems untouched — retried on the next pull trigger.
  }
}

async function pullNotes(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.notes)) {
      const itemType = remote.item_type as ItemType
      const itemId = remote.item_id as string
      const local = await db.notes.get([itemType, itemId])
      const remoteUpdatedAt = new Date(remote.updated_at as string)
      if (local && remoteUpdatedAt <= local.updatedAt) continue
      await db.notes.put({ itemId, itemType, text: remote.text as string, updatedAt: remoteUpdatedAt })
    }
  } catch {
    // Leave local notes untouched — retried on the next pull trigger.
  }
}

async function pullSettings(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.settings)) {
      const key = remote.key as string
      const local = await db.settings.get(key)
      const remoteUpdatedAt = new Date(remote.updated_at as string)
      if (local && remoteUpdatedAt <= local.updatedAt) continue
      await db.settings.put({ key, value: remote.value as number, updatedAt: remoteUpdatedAt })
    }
  } catch {
    // Leave local settings untouched — retried on the next pull trigger.
  }
}

async function pullStandaloneNotes(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.standaloneNotes)) {
      const remoteId = remote.id as string
      const local = await db.standaloneNotes.where('remoteId').equals(remoteId).first()
      const remoteUpdatedAt = new Date(remote.updated_at as string)
      const title = remote.title as string
      const text = remote.text as string
      if (local) {
        if (remoteUpdatedAt <= local.updatedAt) continue
        await db.standaloneNotes.update(local.id!, { title, text, updatedAt: remoteUpdatedAt })
      } else {
        await db.standaloneNotes.add({ remoteId, title, text, updatedAt: remoteUpdatedAt })
      }
    }
  } catch {
    // Leave local standaloneNotes untouched — retried on the next pull trigger.
  }
}

/** Append-only history — no last-write-wins needed, just dedupe by remoteId. */
async function pullReviewLogs(): Promise<void> {
  try {
    for (const remote of await fetchAll(CLOUD_TABLE.reviewLogs)) {
      const remoteId = remote.id as string
      const exists = await db.reviewLogs.where('remoteId').equals(remoteId).first()
      if (exists) continue
      await db.reviewLogs.add({
        remoteId,
        itemId: remote.item_id as string,
        itemType: remote.item_type as ItemType,
        rating: remote.rating as number,
        state: remote.state as number,
        due: new Date(remote.due as string),
        stability: remote.stability as number,
        difficulty: remote.difficulty as number,
        scheduled_days: remote.scheduled_days as number,
        learning_steps: remote.learning_steps as number,
        review: new Date(remote.review as string),
      })
    }
  } catch {
    // Leave local reviewLogs untouched — retried on the next pull trigger.
  }
}

/**
 * Pulls remote changes down into local IndexedDB. Silently no-ops when not
 * logged in / not configured — same guard as push. Each table is fetched and
 * written independently (one table's failure doesn't block the others).
 *
 * Safety rules (data loss here would be far worse than a missed sync):
 * - never deletes/clears a local table — a remote table missing some row is
 *   never treated as "so delete it locally"; this file has no code path that
 *   calls `.delete()`/`.clear()` on any of the six tables, which is what
 *   actually guarantees it, not a runtime check
 * - only overwrites a local row when the remote `updated_at` is strictly
 *   newer than the local row's own timestamp — equal or older leaves local
 *   untouched (last-write-wins, ties go to local)
 * - every local write here bypasses enqueueSync() entirely, so a pull can
 *   never re-trigger a push for the same data (no pull→push loop)
 */
export async function pullRemoteChanges(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  await pullCards()
  await pullQueuedItems()
  await pullNotes()
  await pullSettings()
  await pullStandaloneNotes()
  await pullReviewLogs()
}
