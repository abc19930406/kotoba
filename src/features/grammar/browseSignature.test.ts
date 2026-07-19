import { describe, expect, it } from 'vitest'
import { browseSignature } from './GrammarBrowsePage.tsx'

describe('browseSignature', () => {
  it('is identical for identical level/search', () => {
    expect(browseSignature('N5', 'ている')).toBe(browseSignature('N5', 'ている'))
  })

  it('differs when level differs', () => {
    expect(browseSignature('N5', '')).not.toBe(browseSignature('N4', ''))
  })

  it('differs when search differs', () => {
    expect(browseSignature('N5', 'a')).not.toBe(browseSignature('N5', 'b'))
  })
})
