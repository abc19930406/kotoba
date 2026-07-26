import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Shares the main site's Supabase project (same Auth users, same
// email/password login) — kotoba only uses Auth here, no data sync yet.
// persistSession defaults to true (session in localStorage); kotoba's own
// origin naturally isolates it from the main site's own localStorage.
//
// `supabase` is `null` when the env vars aren't configured (e.g. local dev
// before `.env` is set up): createClient() throws synchronously on a missing
// URL, and this module is imported unconditionally from HomePage, so without
// this guard the whole app would crash on load — a direct violation of the
// offline-first guarantee. With the guard, login is simply unavailable.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
