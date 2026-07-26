import { useState, type FormEvent } from 'react'
import { supabase } from '../../db/supabase.ts'
import { goBack } from '../../shared/backStack.ts'

interface LoginPageProps {
  onBack: () => void
}

export function LoginPage({ onBack }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supabase) {
      setError('登入功能尚未設定完成，請稍後再試')
      return
    }
    setSubmitting(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // Supabase deliberately doesn't distinguish "unknown email" from
        // "wrong password" for security — status 400 covers both.
        setError(signInError.status === 400 ? '帳號或密碼錯誤' : '登入失敗，請稍後再試')
        return
      }
      goBack()
    } catch {
      // signInWithPassword itself throwing (rather than returning an
      // `error`) means the request never reached Supabase — offline/DNS/etc.
      setError('網路連線失敗，請檢查網路後再試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="vocab-detail">
      <button type="button" className="vocab-detail-back" onClick={onBack}>
        ← 返回首頁
      </button>

      <h1>登入</h1>

      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="vocab-error-inline">{error}</p>}
        <button type="submit" className="note-add-button" disabled={submitting}>
          {submitting ? '登入中…' : '登入'}
        </button>
      </form>
    </div>
  )
}
