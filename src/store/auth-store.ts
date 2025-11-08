import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'
import { formatRut, validateRut } from '@/lib/rut'
import type { Role } from '@/types/database'

export interface AuthUser {
  rut: string
  nombre: string
  cargo: Role
  terminal: string
  foto_url?: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  lastVisitedPath: string
  login: (rut: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setLastVisitedPath: (path: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,
      lastVisitedPath: '/app/formulario',
      login: async (rut: string, password: string) => {
        set({ loading: true, error: null })
        if (!validateRut(rut)) {
          set({ loading: false, error: 'RUT inválido' })
          return
        }
        try {
          const formattedRut = formatRut(rut)
          const { data, error } = await supabase
            .from('usuarios')
            .select('rut, nombre, cargo, terminal, password, foto_url')
            .eq('rut', formattedRut)
            .maybeSingle()

          if (error) throw error
          if (!data) {
            set({ loading: false, error: 'RUT no registrado' })
            return
          }

          const passwordMatches = await bcrypt.compare(password, data.password)
          if (!passwordMatches) {
            set({ loading: false, error: 'Contraseña incorrecta' })
            return
          }

          const authUser: AuthUser = {
            rut: data.rut,
            nombre: data.nombre,
            cargo: data.cargo as Role,
            terminal: data.terminal,
            foto_url: data.foto_url,
          }

          set({ loading: false, user: authUser, error: null })
        } catch (error) {
          console.error('Error al iniciar sesión', error)
          set({
            loading: false,
            error: 'No pudimos validar las credenciales. Intenta nuevamente.',
          })
        }
      },
      logout: async () => {
        await supabase.auth.signOut().catch(() => undefined)
        set({ user: null, lastVisitedPath: '/app/formulario' })
      },
      setLastVisitedPath: (path: string) => set({ lastVisitedPath: path }),
    }),
    {
      name: 'nmcheck-auth',
      version: 1,
      partialize: (state) => ({
        user: state.user,
        lastVisitedPath: state.lastVisitedPath,
      }),
    }
  )
)
