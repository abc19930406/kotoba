import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// RTL's auto-cleanup relies on a global `afterEach`, which isn't present
// since vitest.config.ts intentionally omits `test.globals` (explicit
// imports only) — wire it up manually so DOM doesn't leak between tests.
afterEach(cleanup)
