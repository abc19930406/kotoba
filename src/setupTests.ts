import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL's auto-cleanup relies on a global `afterEach`, which isn't present
// since vitest.config.ts intentionally omits `test.globals` (explicit
// imports only) — wire it up manually so DOM doesn't leak between tests.
afterEach(cleanup)

// jsdom doesn't implement matchMedia at all; App.tsx's theme effect calls it
// unconditionally on mount, so every test that renders <App> needs this.
// "matches: false" is an arbitrary default (no test relies on the initial
// value) — tests that care about system-dark-mode behavior stub their own.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
