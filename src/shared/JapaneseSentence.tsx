import { Fragment } from 'react'
import type { FuriganaSegment } from './contentTypes.ts'

interface JapaneseSentenceProps {
  jpSegments: FuriganaSegment[]
  showFurigana: boolean
  className?: string
}

/** Renders a Japanese sentence from its furigana segments — no HTML string, no dangerouslySetInnerHTML. */
export function JapaneseSentence({ jpSegments, showFurigana, className }: JapaneseSentenceProps) {
  if (!showFurigana) {
    return <p className={className}>{jpSegments.map((s) => s[0]).join('')}</p>
  }
  return (
    <p className={className}>
      {jpSegments.map((segment, i) =>
        segment.length === 2 ? (
          <ruby key={i}>
            {segment[0]}
            <rt>{segment[1]}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{segment[0]}</Fragment>
        ),
      )}
    </p>
  )
}
