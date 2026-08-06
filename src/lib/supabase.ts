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
      // La aplicación no usa Supabase Auth: valida contra la tabla `usuarios`
      // mediante la función `autenticar_usuario` del servidor. Dejar activas
      // las tres opciones hacía que el cliente mantuviera una maquinaria de
      // sesión que nunca existe, y `detectSessionInUrl` además lee tokens de
      // la barra de direcciones: es una vía de entrada que aquí no hace falta
      // y que conviene no tener abierta.
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
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
