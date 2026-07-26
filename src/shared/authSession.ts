import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../db/supabase.ts'

/** Current Supabase Auth session, reactively updated. Starts `null` (treated the same as "not yet loaded" and "confirmed logged out" — the brief loading flicker doesn't gate any interaction, matching HomePage's existing loose-loading conventions). */
export function useAuthSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.unsubscribe()
  }, [])

  return session
}
