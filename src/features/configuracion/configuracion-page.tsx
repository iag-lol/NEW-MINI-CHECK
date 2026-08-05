import { BellRing, CheckCircle2, ShieldCheck, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { playNotificationTone } from '@/lib/sound'
import { useNotificationStore } from '@/store/notification-store'

export const ConfiguracionPage = () => {
  const {
    permissionGranted,
    browserNotificationsEnabled,
    soundEnabled,
    requestPermission,
    setBrowserNotificationsEnabled,
    setSoundEnabled,
  } = useNotificationStore()

  const notificationsSupported =
    typeof window !== 'undefined' && 'Notification' in window
  const permissionDenied =
    notificationsSupported && Notification.permission === 'denied'

  const handleBrowserToggle = async (enabled: boolean) => {
    if (!enabled) {
      setBrowserNotificationsEnabled(false)
      return
    }

    if (permissionGranted) {
      setBrowserNotificationsEnabled(true)
      return
    }

    await requestPermission()
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="glass-panel relative overflow-hidden rounded-[26px] p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-400/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
              Preferencias
            </p>
            <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">
              Configuración
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Personaliza cómo la plataforma te mantiene informado.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-brand-50/80 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <BellRing className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-slate-900 dark:text-white">Notificaciones del sistema</h2>
                {permissionGranted && (
                  <Badge variant="success" className="normal-case tracking-normal">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Autorizadas
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Muestra avisos nativos incluso cuando estás trabajando en otra pestaña.
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/35 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:bg-white/[0.035]">
            <label htmlFor="browser-notifications" className="min-w-0 flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Avisos en el dispositivo
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                {permissionDenied
                  ? 'Debes habilitarlos desde los ajustes del navegador.'
                  : notificationsSupported
                    ? 'Puedes cambiar esta preferencia cuando quieras.'
                    : 'Tu navegador no admite notificaciones nativas.'}
              </span>
            </label>
            <Switch
              id="browser-notifications"
              aria-label="Activar notificaciones en el dispositivo"
              checked={browserNotificationsEnabled && permissionGranted}
              disabled={!notificationsSupported || permissionDenied}
              onCheckedChange={(enabled) => void handleBrowserToggle(enabled)}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-violet-50/80 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-900 dark:text-white">Sonido de alertas</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Reproduce una señal breve cuando llega un evento importante.
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/35 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:bg-white/[0.035]">
            <label htmlFor="notification-sound" className="min-w-0 flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Sonido de notificación
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Preferencia guardada en este dispositivo.
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Switch
                id="notification-sound"
                aria-label="Activar sonido de notificaciones"
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!soundEnabled}
                onClick={playNotificationTone}
              >
                <Volume2 className="h-4 w-4" />
                Probar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
