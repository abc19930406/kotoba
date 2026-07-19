import type { MouseEvent } from 'react'
import { speak, useSpeechAvailable } from './speech.ts'

interface SpeakButtonProps {
  text: string
  label?: string
}

export function SpeakButton({ text, label = '播放發音' }: SpeakButtonProps) {
  const available = useSpeechAvailable()
  if (!available) return null

  function handleClick(e: MouseEvent) {
    // Never let this bubble into an ancestor's own click handler (e.g. ReviewCard's flip-on-tap).
    e.stopPropagation()
    speak(text)
  }

  return (
    <button type="button" className="speak-button" onClick={handleClick} aria-label={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>
    </button>
  )
}
