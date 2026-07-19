import { describe, expect, it } from 'vitest'
import { scaleToFit } from './imageCompression.ts'

describe('scaleToFit', () => {
  it('leaves dimensions untouched when already within the max', () => {
    expect(scaleToFit(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('leaves dimensions untouched when the longest side exactly equals the max', () => {
    expect(scaleToFit(1280, 720, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('scales down a landscape image so the width (longest side) hits the max, preserving aspect ratio', () => {
    const result = scaleToFit(2560, 1440, 1280)
    expect(result.width).toBe(1280)
    expect(result.height).toBe(720) // 1440 * (1280/2560)
  })

  it('scales down a portrait image so the height (longest side) hits the max, preserving aspect ratio', () => {
    const result = scaleToFit(1440, 2560, 1280)
    expect(result.height).toBe(1280)
    expect(result.width).toBe(720)
  })
})
