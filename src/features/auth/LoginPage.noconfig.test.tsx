import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { resetBackStackForTests } from '../../shared/backStack.ts'

// Mirrors the real degraded state when VITE_SUPABASE_URL/ANON_KEY aren't
// configured — src/db/supabase.ts exports `supabase: null` in that case.
vi.mock('../../db/supabase.ts', () => ({ supabase: null }))

const { LoginPage } = await import('./LoginPage.tsx')

beforeEach(() => {
  resetBackStackForTests()
})

describe('LoginPage (Supabase not configured)', () => {
  it('shows a clear message instead of crashing on submit', async () => {
    render(<LoginPage onBack={() => {}} />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => expect(screen.getByText('登入功能尚未設定完成，請稍後再試')).toBeInTheDocument())
  })
})
