import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpeakButton } from './SpeakButton.tsx'
import * as speech from './speech.ts'

describe('SpeakButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when speech is unavailable', () => {
    vi.spyOn(speech, 'useSpeechAvailable').mockReturnValue(false)
    const { container } = render(<SpeakButton text="こんにちは" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a button and calls speak(text, "sentence") on click by default', () => {
    vi.spyOn(speech, 'useSpeechAvailable').mockReturnValue(true)
    const speakSpy = vi.spyOn(speech, 'speak').mockImplementation(() => {})

    render(<SpeakButton text="こんにちは" label="播放發音" />)
    fireEvent.click(screen.getByRole('button', { name: '播放發音' }))

    expect(speakSpy).toHaveBeenCalledWith('こんにちは', 'sentence')
  })

  it('passes context="word" through to speak() when given', () => {
    vi.spyOn(speech, 'useSpeechAvailable').mockReturnValue(true)
    const speakSpy = vi.spyOn(speech, 'speak').mockImplementation(() => {})

    render(<SpeakButton text="たべる" label="播放單字發音" context="word" />)
    fireEvent.click(screen.getByRole('button', { name: '播放單字發音' }))

    expect(speakSpy).toHaveBeenCalledWith('たべる', 'word')
  })

  it("stops the click from bubbling to an ancestor's own onClick handler", () => {
    vi.spyOn(speech, 'useSpeechAvailable').mockReturnValue(true)
    vi.spyOn(speech, 'speak').mockImplementation(() => {})
    const ancestorClick = vi.fn()

    render(
      <div onClick={ancestorClick}>
        <SpeakButton text="こんにちは" label="播放發音" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: '播放發音' }))

    expect(ancestorClick).not.toHaveBeenCalled()
  })
})
