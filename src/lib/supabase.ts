import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

// Prevent hard crash in development when env vars are missing.
// The app can still render and show a warning instead of a blank page.
const resolvedSupabaseUrl = supabaseUrl || 'https://example.supabase.co'
const resolvedSupabaseAnonKey = supabaseAnonKey || 'public-anon-key-not-configured'

export const supabase = createClient<Database>(
  resolvedSupabaseUrl,
  resolvedSupabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    global: {
      fetch: (...args) =>
        fetch(...args).catch((error) => {
          console.error('Network error while calling Supabase', error)
          throw error
        }),
    },
  }
)
