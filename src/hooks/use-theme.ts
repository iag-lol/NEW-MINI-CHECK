import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

export const TEMAS = {
  original: {
    nombre: '🔵 Original (Azul)',
    colors: {
      primary: '#3B5BFF',
      primaryDark: '#2947E8',
      primaryLight: '#6B7FFF',
      bg: '#FFFFFF',
      bgDark: '#F8FAFC',
      cardBg: '#FFFFFF',
      textPrimary: '#1E293B',
    },
  },
  rosado: {
    nombre: '💗 Rosado Vibrante',
    colors: {
      primary: '#FF1493',
      primaryDark: '#C71585',
      primaryLight: '#FF69B4',
      bg: '#FFF5FA',
      bgDark: '#FFE4F0',
      cardBg: '#FFFFFF',
      textPrimary: '#8B0A50',
    },
  },
  fucsia: {
    nombre: '💖 Fucsia Intenso',
    colors: {
      primary: '#E91E63',
      primaryDark: '#C2185B',
      primaryLight: '#F06292',
      bg: '#FFF0F5',
      bgDark: '#FCE4EC',
      cardBg: '#FFFFFF',
      textPrimary: '#880E4F',
    },
  },
  azul: {
    nombre: '⚡ Azul Eléctrico',
    colors: {
      primary: '#2563EB',
      primaryDark: '#1E40AF',
      primaryLight: '#60A5FA',
      bg: '#EFF6FF',
      bgDark: '#DBEAFE',
      cardBg: '#FFFFFF',
      textPrimary: '#1E3A8A',
    },
  },
  negro: {
    nombre: '🖤 Negro Profesional',
    colors: {
      primary: '#0F172A',
      primaryDark: '#020617',
      primaryLight: '#334155',
      bg: '#F8FAFC',
      bgDark: '#F1F5F9',
      cardBg: '#FFFFFF',
      textPrimary: '#0F172A',
    },
  },
  'rojo-azul': {
    nombre: '❤️ Rojo Intenso',
    colors: {
      primary: '#DC2626',
      primaryDark: '#B91C1C',
      primaryLight: '#EF4444',
      bg: '#FEF2F2',
      bgDark: '#FEE2E2',
      cardBg: '#FFFFFF',
      textPrimary: '#7F1D1D',
    },
  },
  verde: {
    nombre: '💚 Verde Esmeralda',
    colors: {
      primary: '#10B981',
      primaryDark: '#059669',
      primaryLight: '#34D399',
      bg: '#F0FDF4',
      bgDark: '#DCFCE7',
      cardBg: '#FFFFFF',
      textPrimary: '#064E3B',
    },
  },
  morado: {
    nombre: '💜 Morado Real',
    colors: {
      primary: '#7C3AED',
      primaryDark: '#6D28D9',
      primaryLight: '#A78BFA',
      bg: '#F5F3FF',
      bgDark: '#EDE9FE',
      cardBg: '#FFFFFF',
      textPrimary: '#4C1D95',
    },
  },
  naranja: {
    nombre: '🧡 Naranja Vibrante',
    colors: {
      primary: '#F97316',
      primaryDark: '#EA580C',
      primaryLight: '#FB923C',
      bg: '#FFF7ED',
      bgDark: '#FFEDD5',
      cardBg: '#FFFFFF',
      textPrimary: '#7C2D12',
    },
  },
} as const

export type TemaId = keyof typeof TEMAS

function aplicarTema(temaId: TemaId) {
  const tema = TEMAS[temaId]
  if (!tema) return

  const root = document.documentElement

  // Aplicar colores primarios/acento con mayor saturación
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

  // IMPORTANTE: Mantener colores vibrantes en modo oscuro
  // Sobrescribir variables dark de Tailwind para que no interfieran
  const isDarkMode = root.classList.contains('dark')
  if (isDarkMode && temaId !== 'original') {
    // Si está en modo oscuro Y tiene un tema personalizado,
    // forzar los colores del tema sobre el modo oscuro
    root.style.setProperty('--tw-bg-opacity', '1')
    root.style.setProperty('--tw-text-opacity', '1')

    // Hacer que los botones y elementos mantengan los colores vibrantes
    const style = document.createElement('style')
    style.id = 'custom-theme-override'

    // Eliminar estilo anterior si existe
    const oldStyle = document.getElementById('custom-theme-override')
    if (oldStyle) oldStyle.remove()

    style.textContent = `
      /* Forzar colores del tema en modo oscuro */
      .dark button[class*="bg-brand"],
      .dark [class*="bg-brand"],
      .dark [class*="from-brand"],
      .dark [class*="to-brand"] {
        background-color: var(--color-brand-500) !important;
        color: white !important;
      }

      .dark button[class*="bg-brand"]:hover,
      .dark [class*="bg-brand"]:hover {
        background-color: var(--color-brand-600) !important;
      }

      .dark [class*="text-brand"] {
        color: var(--color-brand-500) !important;
      }

      .dark [class*="border-brand"] {
        border-color: var(--color-brand-500) !important;
      }

      /* Mantener fondos claros en modo oscuro cuando hay tema personalizado */
      .dark .bg-theme {
        background-color: var(--color-theme-bg) !important;
      }
    `
    document.head.appendChild(style)
  } else {
    // Si no hay tema personalizado o no está en dark mode, limpiar overrides
    const oldStyle = document.getElementById('custom-theme-override')
    if (oldStyle) oldStyle.remove()
  }

  // Guardar en localStorage para persistencia
  localStorage.setItem('theme', temaId)
}

export function useTheme() {
  const { user } = useAuthStore()

  // Query para obtener el tema del usuario
  const { data: temaUsuario } = useQuery({
    queryKey: ['user-theme', user?.rut],
    queryFn: async () => {
      if (!user) return 'original'

      const { data, error } = await supabase
        .from('usuarios')
        .select('tema_color')
        .eq('rut', user.rut)
        .single()

      if (error || !data) return 'original'
      return data.tema_color as TemaId
    },
    enabled: !!user,
    staleTime: 0, // Siempre considera los datos como stale para refrescar
    gcTime: 1000 * 60 * 5, // Mantener en caché por 5 minutos
    refetchOnMount: true, // Refrescar al montar el componente
    refetchOnWindowFocus: false, // No refrescar al enfocar la ventana (evita flickering)
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
        aplicarTema('original')
      }
    }
  }, [temaUsuario])

  return {
    temaActual: temaUsuario || 'original',
    aplicarTema,
    temas: TEMAS,
  }
}
