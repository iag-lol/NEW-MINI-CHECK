import { AlertTriangle, Radar } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import type { TrackingSnapshot } from '@/hooks/use-realtime-location'

export const TrackingStatus = ({
  isTracking,
  error,
  location,
  lastHeartbeat,
}: TrackingSnapshot) => {

  const statusLabel = error
    ? 'Error de tracking'
    : isTracking
      ? 'Tracking activo'
      : 'Tracking inactivo'

  const secondaryLabel = error
    ? error
    : location
      ? `Lat ${location.lat.toFixed(3)}, Lon ${location.lon.toFixed(3)} · ±${Math.round(location.accuracy)}m`
      : 'Esperando ubicación...'

  const heartbeatLabel = lastHeartbeat
    ? `Pulso ${dayjs(lastHeartbeat).fromNow()}`
    : 'Sin heartbeat'

  const containerClass = error
    ? 'border-red-200/80 bg-red-50/80 text-red-700 shadow-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
    : isTracking
      ? 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'border-slate-200/80 bg-white/70 text-slate-600 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/60 dark:text-slate-300'

  const Icon = error ? AlertTriangle : Radar

  return (
    <div
      className={cn(
        'hidden min-w-[240px] items-center gap-3 rounded-2xl border px-3 py-2 text-xs md:flex',
        containerClass
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-current dark:bg-slate-950/40">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
          GPS
        </span>
        <span className="text-sm font-bold">{statusLabel}</span>
        <span className="text-[11px] font-medium opacity-90">{secondaryLabel}</span>
        <span className="text-[10px] opacity-70">{heartbeatLabel}</span>
      </div>
    </div>
  )
}
