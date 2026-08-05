import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  Info,
  Smartphone,
  Trash2,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useNotificationStore } from '@/store/notification-store'
import { InstallAppCard } from '@/components/install-app'
import { desbloquearAudio, playNotificationTone } from '@/lib/sound'

const estilosPorTipo = {
  success: {
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/14 text-amber-600 dark:text-amber-300',
  },
  error: {
    icon: AlertTriangle,
    dot: 'bg-red-500',
    chip: 'bg-red-500/12 text-red-600 dark:text-red-300',
  },
  info: {
    icon: Info,
    dot: 'bg-brand-500',
    chip: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  },
} as const

const etiquetaDia = (fecha: string) => {
  const dia = dayjs(fecha).startOf('day')
  const hoy = dayjs().startOf('day')
  const diff = hoy.diff(dia, 'day')
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return dia.format('D [de] MMMM')
}

export const NotificationCenter = () => {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [ajustesVisibles, setAjustesVisibles] = useState(false)

  const notifications = useNotificationStore((s) => s.notifications)
  const unread = useNotificationStore((s) => s.unread)
  const permiso = useNotificationStore((s) => s.permiso)
  const browserNotificationsEnabled = useNotificationStore(
    (s) => s.browserNotificationsEnabled
  )
  const soundEnabled = useNotificationStore((s) => s.soundEnabled)
  const vibrationEnabled = useNotificationStore((s) => s.vibrationEnabled)
  const markAll = useNotificationStore((s) => s.markAll)
  const markAsRead = useNotificationStore((s) => s.markAsRead)
  const remove = useNotificationStore((s) => s.remove)
  const clear = useNotificationStore((s) => s.clear)
  const requestPermission = useNotificationStore((s) => s.requestPermission)
  const setBrowserNotificationsEnabled = useNotificationStore(
    (s) => s.setBrowserNotificationsEnabled
  )
  const setSoundEnabled = useNotificationStore((s) => s.setSoundEnabled)
  const setVibrationEnabled = useNotificationStore((s) => s.setVibrationEnabled)

  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof notifications>()
    notifications.forEach((notification) => {
      const clave = etiquetaDia(notification.createdAt)
      mapa.set(clave, [...(mapa.get(clave) ?? []), notification])
    })
    return [...mapa.entries()]
  }, [notifications])

  const activarNotificaciones = async () => {
    desbloquearAudio()
    const concedido = await requestPermission()
    if (concedido) playNotificationTone('success')
  }

  const abrirNotificacion = (id: string, url?: string) => {
    markAsRead(id)
    if (url) {
      navigate(url)
      setAbierto(false)
    }
  }

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Abrir notificaciones'
          }
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-slate-500 transition active:scale-95 hover:border-white/60 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10 sm:h-10 sm:w-10"
        >
          {unread > 0 ? (
            <BellRing className="h-[18px] w-[18px]" />
          ) : (
            <Bell className="h-[18px] w-[18px]" />
          )}
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key="contador"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', damping: 16, stiffness: 420 }}
                className="absolute -right-0.5 -top-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[9.5px] font-black tabular-nums text-white ring-2 ring-white dark:ring-slate-950"
              >
                {unread > 99 ? '99+' : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </SheetTrigger>

      <SheetContent className="sm:max-w-[25rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
              Notificaciones
            </h3>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
              {unread > 0
                ? `${unread} sin leer · eventos en vivo`
                : 'Todo al día · eventos en vivo'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setAjustesVisibles((prev) => !prev)}
              aria-label="Ajustes de notificaciones"
              aria-pressed={ajustesVisibles}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-95',
                ajustesVisibles
                  ? 'border-brand-400/50 bg-brand-500/12 text-brand-600 dark:text-brand-300'
                  : 'border-white/60 bg-white/40 text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.05] dark:text-slate-300'
              )}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={markAll}
              disabled={!unread}
              aria-label="Marcar todo como leído"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/40 text-slate-500 transition active:scale-95 disabled:opacity-40 dark:border-white/[0.07] dark:bg-white/[0.05] dark:text-slate-300"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Aviso: sin permiso concedido no llega nada al sistema operativo */}
        {permiso !== 'granted' && permiso !== 'unsupported' && (
          <button
            type="button"
            onClick={() => void activarNotificaciones()}
            className="mt-3.5 flex w-full items-center gap-2.5 rounded-[18px] border border-brand-400/40 bg-gradient-to-r from-brand-500/12 to-violet-500/10 p-2.5 text-left transition active:scale-[0.985]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md">
              <BellRing className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-bold text-slate-900 dark:text-white">
                {permiso === 'denied'
                  ? 'Notificaciones bloqueadas'
                  : 'Activar avisos del sistema'}
              </span>
              <span className="block text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                {permiso === 'denied'
                  ? 'Habilítalas en los ajustes del navegador para este sitio.'
                  : 'Recibe cada bus revisado en tu escritorio o celular.'}
              </span>
            </span>
          </button>
        )}

        <AnimatePresence initial={false}>
          {ajustesVisibles && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3.5 space-y-2 rounded-[18px] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
                <AjusteFila
                  icon={Bell}
                  label="Avisos del sistema"
                  hint="Escritorio y celular"
                  checked={browserNotificationsEnabled}
                  disabled={permiso !== 'granted'}
                  onCheckedChange={setBrowserNotificationsEnabled}
                />
                <AjusteFila
                  icon={Volume2}
                  label="Sonido"
                  hint="Campanita al recibir"
                  checked={soundEnabled}
                  onCheckedChange={(valor) => {
                    desbloquearAudio()
                    setSoundEnabled(valor)
                    if (valor) playNotificationTone('info')
                  }}
                />
                <AjusteFila
                  icon={Smartphone}
                  label="Vibración"
                  hint="Sólo en móviles"
                  checked={vibrationEnabled}
                  onCheckedChange={setVibrationEnabled}
                />
                <InstallAppCard compact className="!border-white/50 !bg-white/40 dark:!bg-white/[0.03]" />
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clear}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-semibold text-red-500 transition active:scale-[0.98] hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Vaciar el historial
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 space-y-4 pb-4">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-slate-300/70 px-4 py-9 text-center dark:border-slate-700/70">
              <BellOff className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                Sin notificaciones
              </p>
              <p className="max-w-[15rem] text-[11px] leading-snug text-slate-400">
                Cada vez que un inspector envíe una revisión, el aviso aparecerá aquí.
              </p>
            </div>
          )}

          {grupos.map(([dia, items]) => (
            <section key={dia} className="space-y-1.5">
              <p className="px-1 text-[9.5px] font-black uppercase tracking-[0.16em] text-slate-400">
                {dia}
              </p>
              <AnimatePresence initial={false}>
                {items.map((notification) => {
                  const estilo = estilosPorTipo[notification.type ?? 'info']
                  const Icon = estilo.icon
                  return (
                    <motion.div
                      key={notification.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40, height: 0 }}
                      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          abrirNotificacion(notification.id, notification.url)
                        }
                        className={cn(
                          'group relative flex w-full items-start gap-2.5 rounded-[16px] border p-2.5 text-left transition active:scale-[0.985]',
                          notification.read
                            ? 'border-white/50 bg-white/30 dark:border-white/[0.05] dark:bg-white/[0.02]'
                            : 'border-white/70 bg-white/60 shadow-[var(--glass-shadow-soft)] dark:border-white/[0.09] dark:bg-white/[0.06]'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px]',
                            estilo.chip
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {!notification.read && (
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 shrink-0 rounded-full',
                                  estilo.dot
                                )}
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-slate-900 dark:text-white">
                              {notification.title}
                            </span>
                            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">
                              {dayjs(notification.createdAt).format('HH:mm')}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-600 dark:text-slate-400">
                            {notification.body}
                          </span>
                        </span>

                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label="Descartar notificación"
                          onClick={(event) => {
                            event.stopPropagation()
                            remove(notification.id)
                          }}
                          className="absolute right-1 top-1 hidden rounded-full p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700 group-hover:block dark:hover:bg-white/10"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface AjusteFilaProps {
  icon: typeof Bell
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (value: boolean) => void
}

const AjusteFila = ({
  icon: Icon,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: AjusteFilaProps) => (
  <div
    className={cn(
      'flex items-center gap-2.5 rounded-2xl px-1.5 py-1',
      disabled && 'opacity-45'
    )}
  >
    <Icon className="h-4 w-4 shrink-0 text-slate-400" />
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-bold leading-tight text-slate-800 dark:text-slate-100">
        {label}
      </p>
      <p className="truncate text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">
        {hint}
      </p>
    </div>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="shrink-0"
    />
  </div>
)
