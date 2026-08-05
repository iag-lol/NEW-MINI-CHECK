import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { construirRampa, mixHex } from '@/lib/color'

interface DefinicionTema {
  nombre: string
  /** Familia de color, para agrupar en el selector */
  familia: 'Frío' | 'Cálido' | 'Neutro'
  colors: {
    primary: string
    primaryDark: string
    primaryLight: string
    bg: string
    bgDark: string
    cardBg: string
    textPrimary: string
  }
}

/**
 * Construye un tema completo desde un único color de acento.
 *
 * El fondo es casi neutro con una gota del acento (4 %): así la interfaz se
 * lee como papel y el color sólo aparece donde importa —botones, estados,
 * gráficos—. Los fondos muy saturados de antes competían con los datos.
 */
const definirTema = (
  nombre: string,
  familia: DefinicionTema['familia'],
  acento: string
): DefinicionTema => {
  const rampa = construirRampa(acento)
  return {
    nombre,
    familia,
    colors: {
      primary: rampa[500],
      primaryDark: rampa[600],
      primaryLight: rampa[300],
      bg: mixHex('#F7F8FC', acento, 0.04),
      bgDark: mixHex('#EDF0F7', acento, 0.06),
      cardBg: '#FFFFFF',
      textPrimary: mixHex('#0F172A', acento, 0.1),
    },
  }
}

/**
 * Las claves se conservan tal cual: son los valores ya guardados en la
 * columna `usuarios.tema_color`. Sólo cambian los colores y los nombres.
 */
export const TEMAS = {
  original: definirTema('Índigo corporativo', 'Frío', '#4F46E5'),
  azul: definirTema('Azul acero', 'Frío', '#2563EB'),
  verde: definirTema('Verde esmeralda', 'Frío', '#059669'),
  teal: definirTema('Turquesa profundo', 'Frío', '#0D9488'),
  morado: definirTema('Violeta real', 'Frío', '#7C3AED'),
  fucsia: definirTema('Fucsia sobrio', 'Cálido', '#C026D3'),
  rosado: definirTema('Rosa ejecutivo', 'Cálido', '#DB2777'),
  'rojo-azul': definirTema('Rojo señal', 'Cálido', '#DC2626'),
  naranja: definirTema('Ámbar cobre', 'Cálido', '#EA580C'),
  bronce: definirTema('Bronce', 'Cálido', '#B45309'),
  negro: definirTema('Grafito', 'Neutro', '#334155'),
} as const

export type TemaId = keyof typeof TEMAS

export function aplicarTema(temaId: TemaId) {
  const tema = TEMAS[temaId]
  if (!tema) return

  const root = document.documentElement
  const rampa = construirRampa(tema.colors.primary)

  // Rampa sólida completa: nada de hexadecimales con alfa, que sobre las
  // superficies translúcidas de la app producían colores impredecibles.
  ;(Object.keys(rampa) as unknown as Array<keyof typeof rampa>).forEach((paso) => {
    root.style.setProperty(`--color-brand-${paso}`, rampa[paso])
  })

  root.style.setProperty('--color-theme-bg', tema.colors.bg)
  root.style.setProperty('--color-theme-bg-dark', tema.colors.bgDark)
  root.style.setProperty('--color-theme-card', tema.colors.cardBg)
  root.style.setProperty('--color-theme-text', tema.colors.textPrimary)

  // La barra de estado del móvil acompaña al tema cuando la app está instalada
  document
    .querySelector('meta[name="theme-color"][media*="light"]')
    ?.setAttribute('content', tema.colors.bg)

  // NO pintar el body con estilo inline: eso pisaba el modo noche.
  // El fondo lo maneja index.css vía var(--color-theme-bg) y :root.dark body.
  document.body.style.removeProperty('background-color')

  // Limpiar cualquier override antiguo que forzaba fondos claros en modo oscuro
  const oldStyle = document.getElementById('custom-theme-override')
  if (oldStyle) oldStyle.remove()

  localStorage.setItem('theme', temaId)
}

export function useTheme() {
  const { user } = useAuthStore()

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
      // Un tema retirado en la base de datos no debe dejar la app sin color
      const guardado = data.tema_color as TemaId
      return guardado in TEMAS ? guardado : 'original'
    },
    enabled: !!user,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (temaUsuario) {
      aplicarTema(temaUsuario)
      return
    }

    const savedTheme = localStorage.getItem('theme') as TemaId | null
    aplicarTema(savedTheme && savedTheme in TEMAS ? savedTheme : 'original')
  }, [temaUsuario])

  return {
    temaActual: temaUsuario || 'original',
    aplicarTema,
    temas: TEMAS,
  }
}
