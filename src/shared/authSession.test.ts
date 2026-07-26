import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

type AuthStateCallback = (event: string, session: unknown) => void

const mockUnsubscribe = vi.fn()
const mockGetSession = vi.fn()
let authStateCallback: AuthStateCallback | undefined
const mockOnAuthStateChange = vi.fn((callback: AuthStateCallback) => {
  authStateCallback = callback
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
})

vi.mock('../db/supabase.ts', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}))

const { useAuthSession } = await import('./authSession.ts')

beforeEach(() => {
  mockGetSession.mockReset()
  mockOnAuthStateChange.mockClear()
  mockUnsubscribe.mockClear()
  authStateCallback = undefined
})

describe('useAuthSession', () => {
  it('calls getSession on mount and starts null while unresolved', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useAuthSession())
    expect(mockGetSession).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })

  it('reflects a logged-in session once getSession resolves', async () => {
    const fakeSession = { user: { email: 'a@b.com' } }
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } })
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current).toEqual(fakeSession))
  })

  it('updates when onAuthStateChange fires', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled())

    const newSession = { user: { email: 'c@d.com' } }
    act(() => authStateCallback?.('SIGNED_IN', newSession))

    expect(result.current).toEqual(newSession)
  })

  it('reflects logout (session becomes null) via onAuthStateChange', async () => {
    const fakeSession = { user: { email: 'a@b.com' } }
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } })
    const { result } = renderHook(() => useAuthSession())
    await waitFor(() => expect(result.current).toEqual(fakeSession))

    act(() => authStateCallback?.('SIGNED_OUT', null))

    expect(result.current).toBeNull()
  })

  it('unsubscribes on unmount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const { unmount } = renderHook(() => useAuthSession())
    await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled())

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
