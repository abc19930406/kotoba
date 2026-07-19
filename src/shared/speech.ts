import { useSyncExternalStore } from 'react'

export type SpeechContext = 'word' | 'sentence'
export type SpeechRatePreset = 'slow' | 'standard' | 'fast'

// "標準" 起點：例句 0.85、單字 0.8（單字略慢於例句，抵銷 TTS 對孤立短詞偏快
// 的韻律處理，讓兩者聽感一致）。最終數值由真機聽感定案——如需微調，只改這
// 兩個常數，不要動 PRESET_MULTIPLIER 的比例關係。
const BASE_RATE: Record<SpeechContext, number> = { sentence: 0.85, word: 0.8 }

// 三段選項等比縮放上面兩個基準值，慢/快互為倒數關係，標準 = 不縮放。
const PRESET_MULTIPLIER: Record<SpeechRatePreset, number> = { slow: 0.8, standard: 1, fast: 1.25 }

// The public default (used to seed React state before the persisted value
// loads) lives in db/cards.ts as DEFAULT_SPEECH_RATE, matching how
// DEFAULT_THEME lives in cards.ts rather than theme.ts — this module just
// needs *a* starting value for its own cache.
let currentRatePreset: SpeechRatePreset = 'standard'

/**
 * Syncs the module-level rate cache used by speak() — call this on app start
 * and whenever the persisted setting changes (see HomePage.tsx). Kept
 * separate from persistence itself (db/cards.ts owns getSpeechRate/
 * setSpeechRate) so this file stays DB-agnostic, matching how theme.ts/
 * cards.ts split applyTheme() from getTheme()/setTheme().
 */
export function setSpeechRatePreset(preset: SpeechRatePreset): void {
  currentRatePreset = preset
}

let resolvedVoice: SpeechSynthesisVoice | null = null
let settled = false
const listeners = new Set<() => void>()

function pickJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ja = voices.filter((v) => v.lang.toLowerCase().startsWith('ja'))
  if (ja.length === 0) return null
  return ja.find((v) => v.localService) ?? ja[0]
}

function notify(): void {
  listeners.forEach((l) => l())
}

function loadVoices(): void {
  const synth = window.speechSynthesis
  if (!synth) {
    settled = true
    notify()
    return
  }

  const existing = synth.getVoices()
  if (existing.length > 0) {
    resolvedVoice = pickJapaneseVoice(existing)
    settled = true
    notify()
    return
  }

  // Safari/iOS commonly return an empty list on the first getVoices() call —
  // the real list arrives asynchronously via voiceschanged.
  const onVoicesChanged = () => {
    const voices = synth.getVoices()
    if (voices.length === 0) return
    resolvedVoice = pickJapaneseVoice(voices)
    settled = true
    synth.removeEventListener('voiceschanged', onVoicesChanged)
    notify()
  }
  synth.addEventListener('voiceschanged', onVoicesChanged)

  // Some engines never fire voiceschanged (or getVoices() never populates) —
  // bound the wait so the UI doesn't stay stuck "unknown" forever.
  setTimeout(() => {
    if (settled) return
    synth.removeEventListener('voiceschanged', onVoicesChanged)
    resolvedVoice = pickJapaneseVoice(synth.getVoices())
    settled = true
    notify()
  }, 1000)
}

loadVoices()

/** True once a real ja-* voice has been found — SpeakButton hides itself while false. */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => settled && resolvedVoice !== null,
  )
}

/**
 * Speaks `text` in Japanese. Synchronous and side-effect-only (no await
 * anywhere in this function) so it stays inside the click handler's call
 * stack — iOS silently blocks speech that isn't triggered synchronously by
 * a user gesture. No-ops if no Japanese voice was ever found, as a defensive
 * backstop against speechSynthesis silently falling back to a wrong-language
 * default voice — SpeakButton being hidden should already prevent this from
 * being reachable, but speak() itself must never do it either.
 */
export function speak(text: string, context: SpeechContext = 'sentence'): void {
  if (!window.speechSynthesis || !resolvedVoice) return
  window.speechSynthesis.cancel() // stop whatever's currently playing — no overlapping audio on repeated taps
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  utterance.voice = resolvedVoice
  utterance.rate = BASE_RATE[context] * PRESET_MULTIPLIER[currentRatePreset]
  window.speechSynthesis.speak(utterance)
}

/** Test-only: re-resolves voices from scratch and clears subscribers so each test file starts from a clean slate. */
export function resetSpeechForTests(): void {
  resolvedVoice = null
  settled = false
  listeners.clear()
  loadVoices()
}
