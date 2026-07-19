import { z } from 'zod'

const itemTypeSchema = z.enum(['vocab', 'grammar'])
const jlptLevelSchema = z.enum(['N5', 'N4', 'N3', 'N2', 'N1'])

const cardRecordSchema = z.object({
  itemId: z.string(),
  itemType: itemTypeSchema,
  level: jlptLevelSchema,
  due: z.coerce.date(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  last_review: z.coerce.date().optional(),
  suspended: z.boolean(),
})

const reviewLogRecordSchema = z.object({
  id: z.number().optional(),
  itemId: z.string(),
  itemType: itemTypeSchema,
  rating: z.number(),
  state: z.number(),
  due: z.coerce.date(),
  stability: z.number(),
  difficulty: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  review: z.coerce.date(),
})

const queuedItemRecordSchema = z.object({
  itemId: z.string(),
  itemType: itemTypeSchema,
  level: jlptLevelSchema,
  addedAt: z.coerce.date(),
})

const settingRecordSchema = z.object({
  key: z.string(),
  value: z.number(),
})

const noteRecordSchema = z.object({
  itemId: z.string(),
  itemType: itemTypeSchema,
  text: z.string(),
  updatedAt: z.coerce.date(),
})

// Blobs can't survive JSON — images are carried as base64 (see src/db/backup.ts's
// blobToBase64/base64ToBlob) alongside the original MIME type.
const noteImageRecordSchema = z.object({
  id: z.number().optional(),
  noteKey: z.string(),
  sort: z.number(),
  imageBase64: z.string(),
  mimeType: z.string(),
})

const standaloneNoteRecordSchema = z.object({
  id: z.number().optional(),
  title: z.string(),
  text: z.string(),
  updatedAt: z.coerce.date(),
})

export const backupSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.string(),
  cards: z.array(cardRecordSchema),
  reviewLogs: z.array(reviewLogRecordSchema),
  queuedItems: z.array(queuedItemRecordSchema),
  settings: z.array(settingRecordSchema),
  // .default([]) is what makes importing an old backup work — its JSON
  // simply has no notes/noteImages/standaloneNotes keys, and zod fills
  // these in rather than failing validation.
  notes: z.array(noteRecordSchema).default([]),
  noteImages: z.array(noteImageRecordSchema).default([]),
  standaloneNotes: z.array(standaloneNoteRecordSchema).default([]),
})

export type BackupData = z.infer<typeof backupSchema>
