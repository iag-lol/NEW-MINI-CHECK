import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Share, Plus, X, MonitorSmartphone, Check } from 'lucide-react'
import {
  detectarPlataforma,
  estaInstalada,
  lanzarInstalacion,
  nombrePlataforma,
  onInstallPromptChange,
  puedeInstalar,
  type Plataforma,
} from '@/lib/pwa'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const OCULTAR_KEY = 'mini-check-install-oculto'

/** Icono de la app, el mismo que queda en la pantalla de inicio. */
export const AppIcon = ({ className }: { className?: string }) => (
  <img
    src="/icons/icon-192.png"
    alt="Icono de Mini-Check"
    className={cn('rounded-[22%] shadow-lg ring-1 ring-black/5', className)}
    width={64}
    height={64}
  />
)

const instruccionesPorPlataforma: Record<
  Plataforma,
  { pasos: string[]; icono: typeof Share }
> = {
  ios: {
    icono: Share,
    pasos: [
      'Abre esta página en Safari.',
      'Toca el botón Compartir en la barra inferior.',
      'Elige "Añadir a pantalla de inicio".',
      'Confirma con "Añadir": el icono queda junto a tus apps.',
    ],
  },
  android: {
    icono: Plus,
    pasos: [
      'Abre el menú ⋮ de Chrome.',
      'Toca "Instalar aplicación" o "Añadir a pantalla de inicio".',
      'Confirma la instalación.',
    ],
  },
  windows: {
    icono: MonitorSmartphone,
    pasos: [
      'Pulsa el icono de instalar en la barra de direcciones.',
      'O abre el menú ⋮ → "Instalar Mini-Check".',
      'La app queda anclada en la barra de tareas.',
    ],
  },
  macos: {
    icono: MonitorSmartphone,
    pasos: [
      'En Safari: menú Archivo → "Añadir al Dock".',
      'En Chrome/Edge: icono de instalar en la barra de direcciones.',
      'La app queda en el Dock con su propio icono.',
    ],
  },
  otro: {
    icono: Download,
    pasos: [
      'Busca la opción "Instalar aplicación" en el menú del navegador.',
      'La app quedará disponible como icono independiente.',
    ],
  },
}

/** Estado compartido: si hay prompt nativo o toca explicar los pasos. */
const useEstadoInstalacion = () => {
  const [instalada, setInstalada] = useState(estaInstalada)
  const [promptDisponible, setPromptDisponible] = useState(puedeInstalar)
  const plataforma = detectarPlataforma()

  useEffect(() => onInstallPromptChange(setPromptDisponible), [])

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')
    const handler = () => setInstalada(estaInstalada())
    media.addEventListener?.('change', handler)
    window.addEventListener('appinstalled', handler)
    return () => {
      media.removeEventListener?.('change', handler)
      window.removeEventListener('appinstalled', handler)
    }
  }, [])

  return { instalada, promptDisponible, plataforma }
}

interface InstallAppCardProps {
  className?: string
  /** Compacta: pensada para el panel de notificaciones */
  compact?: boolean
}

/**
 * Tarjeta de descarga de la app con el icono real, para el perfil y el
 * centro de notificaciones.
 */
export const InstallAppCard = ({ className, compact }: InstallAppCardProps) => {
  const { instalada, promptDisponible, plataforma } = useEstadoInstalacion()
  const [pasosVisibles, setPasosVisibles] = useState(false)
  const [instalando, setInstalando] = useState(false)

  const { pasos, icono: PasoIcon } = instruccionesPorPlataforma[plataforma]

  const handleInstalar = async () => {
    if (promptDisponible) {
      setInstalando(true)
      const aceptado = await lanzarInstalacion()
      setInstalando(false)
      if (aceptado) return
    }
    setPasosVisibles((prev) => !prev)
  }

  if (instalada) {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-2xl border border-emerald-300/50 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10',
          className
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-emerald-800 dark:text-emerald-200">
            App instalada
          </p>
          <p className="truncate text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
            Recibes avisos aunque cierres el navegador.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[20px] border border-white/60 bg-white/45 dark:border-white/[0.07] dark:bg-white/[0.04]',
        className
      )}
    >
      <div className={cn('flex items-center gap-3', compact ? 'p-2.5' : 'p-3.5')}>
        <AppIcon className={compact ? 'h-10 w-10' : 'h-12 w-12'} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-slate-900 dark:text-white">
            Instalar Mini-Check
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">
            Icono propio en {nombrePlataforma(plataforma)} y avisos en tiempo real.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => void handleInstalar()}
          disabled={instalando}
          className="shrink-0 gap-1.5 px-3"
        >
          <Download className="h-3.5 w-3.5" />
          {instalando ? '...' : 'Instalar'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {pasosVisibles && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ol className="space-y-1.5 border-t border-white/60 px-3.5 py-3 dark:border-white/[0.07]">
              {pasos.map((paso, index) => (
                <li
                  key={paso}
                  className="flex items-start gap-2 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300"
                >
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[9px] font-black text-brand-600 dark:text-brand-300">
                    {index + 1}
                  </span>
                  {paso}
                </li>
              ))}
            </ol>
            <p className="flex items-center gap-1.5 border-t border-white/60 px-3.5 py-2 text-[10.5px] font-semibold text-slate-500 dark:border-white/[0.07] dark:text-slate-400">
              <PasoIcon className="h-3 w-3" />
              Instrucciones para {nombrePlataforma(plataforma)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Banner flotante sobre la barra de navegación móvil. Se muestra una sola vez
 * por dispositivo: si el usuario lo descarta, la tarjeta sigue en el perfil.
 */
export const InstallAppBanner = () => {
  const { instalada, promptDisponible, plataforma } = useEstadoInstalacion()
  const [oculto, setOculto] = useState(true)

  useEffect(() => {
    // Esperar unos segundos: aparecer de golpe al entrar resulta agresivo
    const timeout = window.setTimeout(() => {
      setOculto(localStorage.getItem(OCULTAR_KEY) === '1')
    }, 6000)
    return () => window.clearTimeout(timeout)
  }, [])

  const descartar = () => {
    localStorage.setItem(OCULTAR_KEY, '1')
    setOculto(true)
  }

  // En iOS no hay prompt nativo, pero sí merece la pena sugerirlo
  const merecePena = promptDisponible || plataforma === 'ios'
  if (instalada || oculto || !merecePena) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="floating-above-dock glass-panel-strong fixed left-2.5 right-2.5 z-30 flex items-center gap-2.5 rounded-[20px] p-2.5 lg:hidden"
        role="complementary"
      >
        <AppIcon className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold leading-tight text-slate-900 dark:text-white">
            Añade Mini-Check a tu pantalla
          </p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            Notificaciones al instante de cada bus revisado.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 shrink-0 gap-1 px-2.5 text-[11px]"
          onClick={() => {
            if (promptDisponible) {
              void lanzarInstalacion()
            } else {
              window.location.assign('/app/perfil#instalar')
            }
            descartar()
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Instalar
        </Button>
        <button
          type="button"
          onClick={descartar}
          aria-label="Descartar aviso de instalación"
          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
