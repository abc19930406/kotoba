import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { pushLayer, resetBackStackForTests } from '../../shared/backStack.ts'

const mockSignInWithPassword = vi.fn()

vi.mock('../../db/supabase.ts', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  },
}))

const { LoginPage } = await import('./LoginPage.tsx')

beforeEach(() => {
  resetBackStackForTests()
  mockSignInWithPassword.mockReset()
})

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: password } })
}

describe('LoginPage', () => {
  it('returns to the previous layer (via goBack) after a successful login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    const onPop = vi.fn()
    pushLayer(onPop)
    render(<LoginPage onBack={() => {}} />)

    fillForm('a@b.com', 'password123')
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(onPop).toHaveBeenCalledTimes(1))
  })

  it('shows a friendly message for wrong credentials (status 400)', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { status: 400, message: 'Invalid login credentials' } })
    render(<LoginPage onBack={() => {}} />)

    fillForm('a@b.com', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(screen.getByText('帳號或密碼錯誤')).toBeInTheDocument())
  })

  it('shows a generic message for a non-400 error', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { status: 500, message: 'server error' } })
    render(<LoginPage onBack={() => {}} />)

    fillForm('a@b.com', 'password123')
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(screen.getByText('登入失敗，請稍後再試')).toBeInTheDocument())
  })

  it('shows a network-failure message when the call itself throws', async () => {
    mockSignInWithPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<LoginPage onBack={() => {}} />)

    fillForm('a@b.com', 'password123')
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(screen.getByText('網路連線失敗，請檢查網路後再試')).toBeInTheDocument())
  })

  it('disables the submit button and shows a loading label while submitting', async () => {
    let resolveSignIn: (value: { error: null }) => void = () => {}
    mockSignInWithPassword.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveSignIn = resolve
      }),
    )
    render(<LoginPage onBack={() => {}} />)

    fillForm('a@b.com', 'password123')
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(screen.getByText('登入中…')).toBeInTheDocument())
    expect(screen.getByText('登入中…').closest('button')).toBeDisabled()

    resolveSignIn({ error: null })
    await waitFor(() => expect(screen.queryByText('登入中…')).not.toBeInTheDocument())
  })
})
