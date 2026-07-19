import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { speak, useSpeechAvailable, resetSpeechForTests } from './speech.ts'

class MockUtterance {
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  text: string
  constructor(text: string) {
    this.text = text
  }
}

function makeVoice(overrides: Partial<SpeechSynthesisVoice>): SpeechSynthesisVoice {
  return {
    default: false,
    lang: 'en-US',
    localService: true,
    name: 'mock-voice',
    voiceURI: 'mock-voice',
    ...overrides,
  } as SpeechSynthesisVoice
}

/** `getVoicesFn` is read on every call, so a test can mutate what it returns
 * (simulating the list only becoming available after voiceschanged fires). */
function mockSynth(getVoicesFn: () => SpeechSynthesisVoice[]) {
  const listeners: Record<string, Array<() => void>> = {}
  const synth = {
    getVoices: vi.fn(getVoicesFn),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      ;(listeners[event] ??= []).push(cb)
    }),
    removeEventListener: vi.fn((event: string, cb: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb)
    }),
  }
  return { synth, fireVoicesChanged: () => listeners['voiceschanged']?.forEach((l) => l()) }
}

function install(getVoicesFn: () => SpeechSynthesisVoice[]) {
  const { synth, fireVoicesChanged } = mockSynth(getVoicesFn)
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance)
  return { synth, fireVoicesChanged }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('voice selection', () => {
  it('prefers a localService ja-* voice over a non-local one, and over non-Japanese voices', () => {
    const jaRemote = makeVoice({ lang: 'ja-JP', localService: false, name: 'ja-remote' })
    const jaLocal = makeVoice({ lang: 'ja-JP', localService: true, name: 'ja-local' })
    const enLocal = makeVoice({ lang: 'en-US', localService: true, name: 'en-local' })
    const { synth } = install(() => [enLocal, jaRemote, jaLocal])
    resetSpeechForTests()

    speak('こんにちは')

    expect(synth.speak).toHaveBeenCalledOnce()
    const utterance = synth.speak.mock.calls[0][0] as MockUtterance
    expect(utterance.voice?.name).toBe('ja-local')
    expect(utterance.lang).toBe('ja-JP')
  })

  it('falls back to any ja-* voice when none is localService', () => {
    const jaRemote = makeVoice({ lang: 'ja-JP', localService: false, name: 'ja-remote' })
    const { synth } = install(() => [jaRemote])
    resetSpeechForTests()

    speak('こんにちは')

    expect((synth.speak.mock.calls[0][0] as MockUtterance).voice?.name).toBe('ja-remote')
  })
})

describe('voiceschanged timing', () => {
  it('resolves the voice from the later voiceschanged-triggered list, not the initial empty one', () => {
    let currentVoices: SpeechSynthesisVoice[] = []
    const { synth, fireVoicesChanged } = install(() => currentVoices)
    resetSpeechForTests()

    // getVoices() was empty when resetSpeechForTests() ran — speak() must not
    // have anything to work with yet.
    speak('まだ')
    expect(synth.speak).not.toHaveBeenCalled()

    currentVoices = [makeVoice({ lang: 'ja-JP', localService: true, name: 'ja-later' })]
    fireVoicesChanged()

    speak('こんにちは')
    expect(synth.speak).toHaveBeenCalledOnce()
    expect((synth.speak.mock.calls[0][0] as MockUtterance).voice?.name).toBe('ja-later')
  })
})

describe('cancel-before-speak', () => {
  it('cancels any in-flight utterance before every speak() call, so repeated taps do not overlap', () => {
    const { synth } = install(() => [makeVoice({ lang: 'ja-JP', localService: true })])
    resetSpeechForTests()

    speak('一')
    speak('二')

    expect(synth.cancel).toHaveBeenCalledTimes(2)
    expect(synth.speak).toHaveBeenCalledTimes(2)
  })
})

describe('degraded when no Japanese voice exists', () => {
  it('speak() no-ops instead of falling back to a non-Japanese default voice', () => {
    const { synth } = install(() => [makeVoice({ lang: 'en-US' }), makeVoice({ lang: 'fr-FR' })])
    resetSpeechForTests()

    speak('こんにちは')

    expect(synth.speak).not.toHaveBeenCalled()
  })

  it('useSpeechAvailable() reports false', () => {
    install(() => [makeVoice({ lang: 'en-US' })])
    resetSpeechForTests()

    const { result } = renderHook(() => useSpeechAvailable())
    expect(result.current).toBe(false)
  })
})

describe('bounded timeout when voiceschanged never fires', () => {
  it('settles instead of hanging forever', () => {
    vi.useFakeTimers()
    const { synth } = install(() => [])
    resetSpeechForTests()

    expect(synth.removeEventListener).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(synth.removeEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function))
  })
})

describe('useSpeechAvailable reactivity', () => {
  it('flips from false to true once a Japanese voice resolves via voiceschanged', () => {
    let currentVoices: SpeechSynthesisVoice[] = []
    const { fireVoicesChanged } = install(() => currentVoices)
    resetSpeechForTests()

    const { result } = renderHook(() => useSpeechAvailable())
    expect(result.current).toBe(false)

    act(() => {
      currentVoices = [makeVoice({ lang: 'ja-JP', localService: true })]
      fireVoicesChanged()
    })

    expect(result.current).toBe(true)
  })
})
