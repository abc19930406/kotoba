export type ThemePreference = 'system' | 'light' | 'dark'

const DARK_THEME_COLOR = '#121212'
const LIGHT_THEME_COLOR = '#6b46c1'

/**
 * Applies `pref` to the document: sets/clears `data-theme` on the root
 * element (CSS handles the actual color-variable overrides) and updates the
 * PWA `theme-color` meta tag to match. `systemPrefersDark` is passed in
 * rather than read via `window.matchMedia` here so this stays a pure,
 * easily-testable function — callers own the media-query subscription.
 */
export function applyTheme(pref: ThemePreference, systemPrefersDark: boolean): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }

  const isDark = pref === 'dark' || (pref === 'system' && systemPrefersDark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}
