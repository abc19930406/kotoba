import { DAILY_PASSCODE_HEADER, type DailyMaterialRequestBody, type DailyMaterialResponseBody } from './dailyMaterialTypes.ts'
import { getDailyPasscode } from './dailyPasscode.ts'

export type DailyMaterialErrorReason = 'passcode' | 'rate-limit' | 'network' | 'server'

export interface DailyMaterialError {
  reason: DailyMaterialErrorReason
}

export type DailyMaterialResult =
  | { ok: true; data: DailyMaterialResponseBody }
  | { ok: false; error: DailyMaterialError }

export async function fetchDailyMaterial(body: DailyMaterialRequestBody): Promise<DailyMaterialResult> {
  let response: Response
  try {
    response = await fetch('/api/daily-material', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [DAILY_PASSCODE_HEADER]: getDailyPasscode(),
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: { reason: 'network' } }
  }

  if (response.status === 401) return { ok: false, error: { reason: 'passcode' } }
  if (response.status === 429) return { ok: false, error: { reason: 'rate-limit' } }
  if (!response.ok) return { ok: false, error: { reason: 'server' } }

  try {
    const data = (await response.json()) as DailyMaterialResponseBody
    return { ok: true, data }
  } catch {
    return { ok: false, error: { reason: 'server' } }
  }
}
