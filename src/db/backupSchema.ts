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

export const backupSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.string(),
  cards: z.array(cardRecordSchema),
  reviewLogs: z.array(reviewLogRecordSchema),
  queuedItems: z.array(queuedItemRecordSchema),
  settings: z.array(settingRecordSchema),
})

export type BackupData = z.infer<typeof backupSchema>
