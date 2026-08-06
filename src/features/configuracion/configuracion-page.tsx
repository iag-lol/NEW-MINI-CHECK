import {
  BellRing,
  CheckCircle2,
  Send,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardEyebrow, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { InstallAppCard } from '@/components/install-app'
import { ModulosAdmin } from '@/features/configuracion/components/modulos-admin'
import { desbloquearAudio, playNotificationTone, vibrar } from '@/lib/sound'
import { useNotificationStore } from '@/store/notification-store'
import { useAuthStore } from '@/store/auth-store'

export const ConfiguracionPage = () => {
  const user = useAuthStore((state) => state.user)
  const permiso = useNotificationStore((state) => state.permiso)
  const browserNotificationsEnabled = useNotificationStore(
    (state) => state.browserNotificationsEnabled
  )
  const soundEnabled = useNotificationStore((state) => state.soundEnabled)
  const vibrationEnabled = useNotificationStore((state) => state.vibrationEnabled)
  const requestPermission = useNotificationStore((state) => state.requestPermission)
  const setBrowserNotificationsEnabled = useNotificationStore(
    (state) => state.setBrowserNotificationsEnabled
  )
  const setSoundEnabled = useNotificationStore((state) => state.setSoundEnabled)
  const setVibrationEnabled = useNotificationStore((state) => state.setVibrationEnabled)
  const push = useNotificationStore((state) => state.push)

  const soportado = permiso !== 'unsupported'
  const denegado = permiso === 'denied'
  const concedido = permiso === 'granted'

  const handleBrowserToggle = async (enabled: boolean) => {
    if (!enabled) {
      setBrowserNotificationsEnabled(false)
      return
    }
    desbloquearAudio()
    if (concedido) {
      setBrowserNotificationsEnabled(true)
      return
    }
    await requestPermission()
  }

  /** Envía un aviso real por todos los canales configurados. */
  const probarNotificacion = () => {
    desbloquearAudio()
    push({
      id: `prueba-${Date.now()}`,
      type: 'success',
      title: 'Prueba de notificación',
      body: `${user?.nombre ?? 'Un inspector'} ha revisado el bus ABCD-12 en el Terminal ${
        user?.terminal ?? 'Central'
      }`,
      url: '/app/configuracion',
    })
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      <Card className="overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-brand-400/15 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md sm:h-12 sm:w-12">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <div className="min-w-0">
            <CardEyebrow>Preferencias</CardEyebrow>
            <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
              Configuración
            </h1>
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 sm:text-sm">
              Cómo la plataforma te mantiene informado.
            </p>
          </div>
        </div>
      </Card>

      <ModulosAdmin />

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-brand-500/12 text-brand-600 dark:text-brand-300">
              <BellRing className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <CardTitle>Avisos del sistema</CardTitle>
                {concedido && (
                  <Badge variant="success" className="normal-case tracking-normal">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Autorizados
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
                Notificaciones nativas en escritorio y celular, incluso con la app en
                segundo plano.
              </p>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-3 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
            <label
              htmlFor="browser-notifications"
              className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200"
            >
              Avisos en este dispositivo
              <span className="mt-0.5 block text-[10.5px] font-normal leading-tight text-slate-500">
                {denegado
                  ? 'Bloqueados: habilítalos en los ajustes del navegador.'
                  : soportado
                    ? 'Puedes cambiarlo cuando quieras.'
                    : 'Tu navegador no admite notificaciones nativas.'}
              </span>
            </label>
            <Switch
              id="browser-notifications"
              aria-label="Activar notificaciones en el dispositivo"
              checked={browserNotificationsEnabled && concedido}
              disabled={!soportado || denegado}
              onCheckedChange={(enabled) => void handleBrowserToggle(enabled)}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={probarNotificacion}
          >
            <Send className="h-3.5 w-3.5" />
            Enviar notificación de prueba
          </Button>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-violet-500/12 text-violet-600 dark:text-violet-300">
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle>Sonido y vibración</CardTitle>
              <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
                Señal breve al recibir un evento. Se guarda en este dispositivo.
              </p>
            </div>
          </div>

          <div className="mt-auto space-y-2">
            <div className="flex items-center gap-3 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
              <label
                htmlFor="notification-sound"
                className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200"
              >
                Sonido
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px]"
                disabled={!soundEnabled}
                onClick={() => {
                  desbloquearAudio()
                  playNotificationTone('success')
                }}
              >
                <Volume2 className="h-3.5 w-3.5" />
                Probar
              </Button>
              <Switch
                id="notification-sound"
                aria-label="Activar sonido de notificaciones"
                checked={soundEnabled}
                onCheckedChange={(valor) => {
                  desbloquearAudio()
                  setSoundEnabled(valor)
                  if (valor) playNotificationTone('info')
                }}
              />
            </div>

            <div className="flex items-center gap-3 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
              <label
                htmlFor="notification-vibration"
                className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200"
              >
                Vibración
                <span className="mt-0.5 block text-[10.5px] font-normal leading-tight text-slate-500">
                  Sólo en teléfonos y tablets.
                </span>
              </label>
              <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <Switch
                id="notification-vibration"
                aria-label="Activar vibración"
                checked={vibrationEnabled}
                onCheckedChange={(valor) => {
                  setVibrationEnabled(valor)
                  if (valor) vibrar()
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card className="space-y-2.5">
        <div>
          <CardEyebrow>Aplicación</CardEyebrow>
          <CardTitle>Instalar Mini-Check</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
            Con la app instalada los avisos llegan como los de cualquier otra
            aplicación del sistema, con contador sobre el icono.
          </p>
        </div>
        <InstallAppCard />
      </Card>
    </div>
  )
}
