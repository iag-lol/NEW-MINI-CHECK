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
      bg: '#FFF5FA',
      bgDark: '#FFE5F1',
      cardBg: '#FFFFFF',
      textPrimary: '#881353',
    },
  },
  fucsia: {
    nombre: 'Fucsia Pastel',
    colors: {
      primary: '#FF9ECD',
      primaryDark: '#FF6BB8',
      primaryLight: '#FFD6ED',
      bg: '#FFF0F9',
      bgDark: '#FFD6ED',
      cardBg: '#FFFFFF',
      textPrimary: '#9D174D',
    },
  },
  azul: {
    nombre: 'Azul',
    colors: {
      primary: '#6366F1',
      primaryDark: '#4F46E5',
      primaryLight: '#A5B4FC',
      bg: '#F0F4FF',
      bgDark: '#E0E7FF',
      cardBg: '#FFFFFF',
      textPrimary: '#312E81',
    },
  },
  negro: {
    nombre: 'Negro Elegante',
    colors: {
      primary: '#1F2937',
      primaryDark: '#111827',
      primaryLight: '#374151',
      bg: '#F9FAFB',
      bgDark: '#F3F4F6',
      cardBg: '#FFFFFF',
      textPrimary: '#111827',
    },
  },
  'rojo-azul': {
    nombre: 'Rojo y Azul',
    colors: {
      primary: '#EF4444',
      primaryDark: '#DC2626',
      primaryLight: '#3B82F6',
      bg: '#FFF1F2',
      bgDark: '#FEE2E2',
      cardBg: '#FFFFFF',
      textPrimary: '#991B1B',
    },
  },
} as const

export type TemaId = keyof typeof TEMAS

function aplicarTema(temaId: TemaId) {
  const tema = TEMAS[temaId]
  if (!tema) return

  const root = document.documentElement

  // Aplicar colores primarios/acento
  root.style.setProperty('--color-brand-50', tema.colors.primaryLight + '20')
  root.style.setProperty('--color-brand-100', tema.colors.primaryLight + '40')
  root.style.setProperty('--color-brand-200', tema.colors.primaryLight + '60')
  root.style.setProperty('--color-brand-300', tema.colors.primaryLight + '90')
  root.style.setProperty('--color-brand-400', tema.colors.primary)
  root.style.setProperty('--color-brand-500', tema.colors.primary)
  root.style.setProperty('--color-brand-600', tema.colors.primaryDark)
  root.style.setProperty('--color-brand-700', tema.colors.primaryDark)
  root.style.setProperty('--color-brand-800', tema.colors.primaryDark + 'DD')
  root.style.setProperty('--color-brand-900', tema.colors.textPrimary)
  root.style.setProperty('--color-brand-950', tema.colors.textPrimary)

  // Aplicar fondos y contenedores
  root.style.setProperty('--color-theme-bg', tema.colors.bg)
  root.style.setProperty('--color-theme-bg-dark', tema.colors.bgDark)
  root.style.setProperty('--color-theme-card', tema.colors.cardBg)
  root.style.setProperty('--color-theme-text', tema.colors.textPrimary)

  // Aplicar a elementos del body
  document.body.style.backgroundColor = tema.colors.bg

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
