import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JapaneseSentence } from './JapaneseSentence.tsx'
import type { FuriganaSegment } from './contentTypes.ts'

const segments: FuriganaSegment[] = [
  ['図書館', 'としょかん'],
  ['にたくさんの'],
  ['本', 'ほん'],
  ['があります。'],
]

describe('JapaneseSentence', () => {
  it('renders ruby/rt markup for kanji segments when showFurigana is on', () => {
    const { container } = render(<JapaneseSentence jpSegments={segments} showFurigana={true} />)
    const rubies = container.querySelectorAll('ruby')
    expect(rubies).toHaveLength(2)
    expect(rubies[0].textContent).toBe('図書館としょかん')
    expect(container.querySelectorAll('rt')).toHaveLength(2)
    expect(container.textContent).toBe('図書館としょかんにたくさんの本ほんがあります。')
  })

  it('renders plain concatenated text with no ruby markup when showFurigana is off', () => {
    const { container } = render(<JapaneseSentence jpSegments={segments} showFurigana={false} />)
    expect(container.querySelectorAll('ruby')).toHaveLength(0)
    expect(container.querySelectorAll('rt')).toHaveLength(0)
    expect(screen.getByText('図書館にたくさんの本があります。')).toBeInTheDocument()
  })

  it('never uses dangerouslySetInnerHTML — asserted indirectly via no script/style leakage', () => {
    const malicious: FuriganaSegment[] = [['<script>alert(1)</script>']]
    const { container } = render(<JapaneseSentence jpSegments={malicious} showFurigana={true} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })
})
