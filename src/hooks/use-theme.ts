import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

export const TEMAS = {
  rosado: {
    nombre: 'Rosado Pastel',
    colors: {
      primary: '#FFB3D9',
      primaryDark: '#FF8FC7',
      primaryLight: '#FFE5F1',
    },
  },
  fucsia: {
    nombre: 'Fucsia Pastel',
    colors: {
      primary: '#FF9ECD',
      primaryDark: '#FF6BB8',
      primaryLight: '#FFD6ED',
    },
  },
  azul: {
    nombre: 'Azul',
    colors: {
      primary: '#6366F1',
      primaryDark: '#4F46E5',
      primaryLight: '#A5B4FC',
    },
  },
  negro: {
    nombre: 'Negro Elegante',
    colors: {
      primary: '#1F2937',
      primaryDark: '#111827',
      primaryLight: '#374151',
    },
  },
  'rojo-azul': {
    nombre: 'Rojo y Azul',
    colors: {
      primary: '#EF4444',
      primaryDark: '#DC2626',
      primaryLight: '#3B82F6',
    },
  },
} as const

export type TemaId = keyof typeof TEMAS

function aplicarTema(temaId: TemaId) {
  const tema = TEMAS[temaId]
  if (!tema) return

  const root = document.documentElement

  // Aplicar colores CSS variables
  root.style.setProperty('--color-brand-50', `${tema.colors.primaryLight}15`)
  root.style.setProperty('--color-brand-100', `${tema.colors.primaryLight}30`)
  root.style.setProperty('--color-brand-200', `${tema.colors.primaryLight}50`)
  root.style.setProperty('--color-brand-300', `${tema.colors.primaryLight}70`)
  root.style.setProperty('--color-brand-400', tema.colors.primary)
  root.style.setProperty('--color-brand-500', tema.colors.primary)
  root.style.setProperty('--color-brand-600', tema.colors.primaryDark)
  root.style.setProperty('--color-brand-700', tema.colors.primaryDark)
  root.style.setProperty('--color-brand-800', tema.colors.primaryDark)
  root.style.setProperty('--color-brand-900', `${tema.colors.primaryDark}CC`)
  root.style.setProperty('--color-brand-950', `${tema.colors.primaryDark}EE`)

  // Guardar en localStorage para persistencia
  localStorage.setItem('theme', temaId)
}

export function useTheme() {
  const { user } = useAuthStore()

  // Query para obtener el tema del usuario
  const { data: temaUsuario } = useQuery({
    queryKey: ['user-theme', user?.rut],
    queryFn: async () => {
      if (!user) return 'azul'

      const { data, error } = await supabase
        .from('usuarios')
        .select('tema_color')
        .eq('rut', user.rut)
        .single()

      if (error || !data) return 'azul'
      return data.tema_color as TemaId
    },
    enabled: !!user,
  })

  // Aplicar tema cuando cambia
  useEffect(() => {
    if (temaUsuario) {
      aplicarTema(temaUsuario)
    } else {
      // Si no hay tema, intentar cargar desde localStorage
      const savedTheme = localStorage.getItem('theme') as TemaId
      if (savedTheme && TEMAS[savedTheme]) {
        aplicarTema(savedTheme)
      } else {
        aplicarTema('azul')
      }
    }
  }, [temaUsuario])

  return {
    temaActual: temaUsuario || 'azul',
    aplicarTema,
    temas: TEMAS,
  }
}
