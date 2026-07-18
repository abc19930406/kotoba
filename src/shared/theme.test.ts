import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme } from './theme.ts'

beforeEach(() => {
  delete document.documentElement.dataset.theme
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '#6b46c1')
  document.head.appendChild(meta)
})

function themeColor(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null
}

describe('applyTheme', () => {
  it('sets data-theme="dark" and the dark meta color for pref "dark", regardless of system preference', () => {
    applyTheme('dark', false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe('#121212')

    applyTheme('dark', true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe('#121212')
  })

  it('sets data-theme="light" and the light meta color for pref "light", regardless of system preference', () => {
    applyTheme('light', true)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(themeColor()).toBe('#6b46c1')

    applyTheme('light', false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(themeColor()).toBe('#6b46c1')
  })

  it('clears data-theme for pref "system" and follows systemPrefersDark for the meta color', () => {
    document.documentElement.dataset.theme = 'dark' // simulate a prior manual override being cleared

    applyTheme('system', true)
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(themeColor()).toBe('#121212')

    applyTheme('system', false)
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(themeColor()).toBe('#6b46c1')
  })
})
