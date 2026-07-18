import { describe, expect, it } from 'vitest'
import { browseSignature } from './VocabBrowsePage.tsx'

describe('browseSignature', () => {
  it('is identical for identical level/search/selectedPos', () => {
    expect(browseSignature('N5', 'たべ', new Set(['v1', 'vt']))).toBe(
      browseSignature('N5', 'たべ', new Set(['v1', 'vt'])),
    )
  })

  it('is order-independent for selectedPos', () => {
    expect(browseSignature('N5', '', new Set(['v1', 'vt']))).toBe(browseSignature('N5', '', new Set(['vt', 'v1'])))
  })

  it('differs when level differs', () => {
    expect(browseSignature('N5', '', new Set())).not.toBe(browseSignature('N4', '', new Set()))
  })

  it('differs when search differs', () => {
    expect(browseSignature('N5', 'a', new Set())).not.toBe(browseSignature('N5', 'b', new Set()))
  })

  it('differs when selectedPos differs', () => {
    expect(browseSignature('N5', '', new Set(['v1']))).not.toBe(browseSignature('N5', '', new Set(['vt'])))
  })
})
