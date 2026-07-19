import { useSyncExternalStore } from 'react'

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
export function speak(text: string): void {
  if (!window.speechSynthesis || !resolvedVoice) return
  window.speechSynthesis.cancel() // stop whatever's currently playing — no overlapping audio on repeated taps
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  utterance.voice = resolvedVoice
  window.speechSynthesis.speak(utterance)
}

/** Test-only: re-resolves voices from scratch and clears subscribers so each test file starts from a clean slate. */
export function resetSpeechForTests(): void {
  resolvedVoice = null
  settled = false
  listeners.clear()
  loadVoices()
}
