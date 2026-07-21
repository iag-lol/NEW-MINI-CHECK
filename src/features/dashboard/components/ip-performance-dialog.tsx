import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  CircleMarker,
  Circle,
  Tooltip as LeafletTooltip,
  useMap,
} from 'react-leaflet'
import { divIcon } from 'leaflet'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bus,
  CheckCircle2,
  Crosshair,
  Globe,
  MapPin,
  Medal,
  Moon,
  Route,
  ShieldCheck,
  Sun,
  User,
  X,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { closestTerminalDistance, haversineMeters } from '@/lib/geofence'
import { TERMINAL_GEOFENCES } from '@/constants/geofences'
import { useActiveInspectors } from '@/hooks/use-active-inspectors'
import { useInspeccionesEnCurso } from '@/hooks/use-inspeccion-presence'

type RevisionRow = Tables<'revisiones'>
type Rango = '1m' | '2m' | 'all'

interface IpUso {
  ip: string
  usos: number
  ciudad: string
  primeraVez: string
  ultimaVez: string
}

interface ColaboradorStats {
  rut: string
  nombre: string
  revisiones: RevisionRow[]
  total: number
  operativos: number
  panne: number
  dentroGeocerca: number
  conGps: number
  distanciaPromedio: number
  precision: number // % de revisiones dentro de geocerca
  ips: IpUso[]
  terminales: string[]
  diasActivos: number
  primeraActividad: string
  ultimaActividad: string
}

const fetchRevisiones = async (rango: Rango): Promise<RevisionRow[]> => {
  let query = supabase
    .from('revisiones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10000)
  if (rango !== 'all') {
    query = query.gte(
      'created_at',
      dayjs().subtract(rango === '1m' ? 1 : 2, 'month').toISOString()
    )
  }
  const { data } = await query
  return (data as RevisionRow[]) ?? []
}

const construirStats = (revisiones: RevisionRow[]): ColaboradorStats[] => {
  const porInspector = new Map<string, RevisionRow[]>()
  revisiones.forEach((rev) => {
    const key = rev.inspector_rut || rev.inspector_nombre
    const list = porInspector.get(key)
    if (list) list.push(rev)
    else porInspector.set(key, [rev])
  })

  const stats: ColaboradorStats[] = []
  porInspector.forEach((revs) => {
    const conGpsList = revs.filter(
      (rev) => typeof rev.lat === 'number' && typeof rev.lon === 'number' && rev.lat !== 0
    )
    const medidas = conGpsList.map((rev) => closestTerminalDistance(rev.lat, rev.lon))
    const dentro = medidas.filter((m) => m.inside).length
    const distanciaPromedio =
      medidas.length > 0
        ? Math.round(medidas.reduce((acc, m) => acc + m.distance, 0) / medidas.length)
        : 0

    const ipsMap = new Map<string, { usos: number; ciudad: string; fechas: string[] }>()
    revs.forEach((rev) => {
      const ip = rev.ip_address ?? 'Sin IP'
      const entry = ipsMap.get(ip) ?? {
        usos: 0,
        ciudad: rev.ip_info
          ? [rev.ip_info.city, rev.ip_info.isp].filter(Boolean).join(' · ') || '—'
          : '—',
        fechas: [],
      }
      entry.usos += 1
      entry.fechas.push(rev.created_at)
      ipsMap.set(ip, entry)
    })
    const ips: IpUso[] = [...ipsMap.entries()]
      .map(([ip, entry]) => ({
        ip,
        usos: entry.usos,
        ciudad: entry.ciudad,
        primeraVez: entry.fechas[entry.fechas.length - 1],
        ultimaVez: entry.fechas[0],
      }))
      .sort((a, b) => b.usos - a.usos)

    const dias = new Set(revs.map((rev) => dayjs(rev.created_at).format('YYYY-MM-DD')))

    stats.push({
      rut: revs[0].inspector_rut,
      nombre: revs[0].inspector_nombre,
      revisiones: revs,
      total: revs.length,
      operativos: revs.filter((rev) => rev.estado_bus === 'OPERATIVO').length,
      panne: revs.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
      dentroGeocerca: dentro,
      conGps: conGpsList.length,
      distanciaPromedio,
      precision: conGpsList.length > 0 ? (dentro / conGpsList.length) * 100 : 0,
      ips,
      terminales: [...new Set(revs.map((rev) => rev.terminal_detectado || rev.terminal_reportado))],
      diasActivos: dias.size,
      primeraActividad: revs[revs.length - 1].created_at,
      ultimaActividad: revs[0].created_at,
    })
  })

  return stats.sort((a, b) => b.total - a.total)
}

const precisionColor = (pct: number) =>
  pct >= 90
    ? 'text-emerald-600 dark:text-emerald-400'
    : pct >= 70
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400'

const medalla = (index: number) => {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}°`
}

// ============================================================
// MAPA OPERATIVO DEL COLABORADOR
// Ubicación en vivo, buses revisados en la semana, bus en
// revisión AHORA (verde) y trayectoria por turno día/noche.
// ============================================================

type Turno = 'todo' | 'dia' | 'noche'

const esTurnoDia = (fecha: string) => {
  const hora = dayjs(fecha).hour()
  return hora >= 8 && hora < 20
}

const escapeHtml = (value: string) => value.replace(/[<>&"']/g, '')

const liveInspectorIcon = (nombre: string, revisandoPpu: string | null) =>
  divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="position:relative;">
        <div style="
          display:flex;align-items:center;justify-content:center;
          width:36px;height:36px;border-radius:50%;
          background:${revisandoPpu ? 'linear-gradient(135deg,#22c55e,#15803d)' : 'linear-gradient(135deg,#0284c7,#0369a1)'};
          color:#fff;font-size:15px;
          border:3px solid rgba(255,255,255,0.95);
          box-shadow:0 6px 16px rgba(15,23,42,0.4);
        ">👤</div>
        <span class="marker-live-dot" style="
          position:absolute;top:-2px;right:-2px;width:12px;height:12px;
          border-radius:50%;background:#22c55e;border:2px solid #fff;
        "></span>
      </div>
      <span style="
        background:${revisandoPpu ? 'rgba(21,128,61,0.95)' : 'rgba(15,23,42,0.88)'};
        color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9px;
        white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,0.3);
      ">${
        revisandoPpu
          ? `🟢 REVISANDO ${escapeHtml(revisandoPpu)} AHORA`
          : escapeHtml(nombre.split(' ').filter(Boolean).slice(0, 2).join(' '))
      }</span>
    </div>`,
    iconSize: [150, 60],
    iconAnchor: [75, 22],
  })

const busPuntoIcon = (enPanne: boolean) =>
  divIcon({
    className: '',
    html: `<div class="marker-bus" style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:9px;
      background:${enPanne ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#22c55e,#16a34a)'};
      border:2px solid rgba(255,255,255,0.95);
      box-shadow:0 4px 10px rgba(15,23,42,0.35);font-size:13px;
    ">🚌</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

const FitBounds = ({ points }: { points: [number, number][] }) => {
  const map = useMap()
  const key = useMemo(() => JSON.stringify(points), [points])
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 15)
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const MapaOperativo = ({
  colaborador,
  live,
  revisando,
}: {
  colaborador: ColaboradorStats
  live?: Tables<'usuarios_activos'>
  revisando?: { ppu: string; interno: string; startedAt: string }
}) => {
  const [verTrayectoria, setVerTrayectoria] = useState(false)
  const [turno, setTurno] = useState<Turno>('todo')

  const puntosGps = useMemo(
    () =>
      colaborador.revisiones.filter(
        (rev) => typeof rev.lat === 'number' && typeof rev.lon === 'number' && rev.lat !== 0
      ),
    [colaborador]
  )

  // Buses revisados dentro de la semana actual (último punto por PPU)
  const busesSemana = useMemo(() => {
    const inicioSemana = dayjs().isoWeekday(1).startOf('day')
    const porPpu = new Map<string, RevisionRow>()
    puntosGps
      .filter((rev) => !dayjs(rev.created_at).isBefore(inicioSemana))
      .forEach((rev) => {
        if (!porPpu.has(rev.bus_ppu)) porPpu.set(rev.bus_ppu, rev)
      })
    return [...porPpu.values()]
  }, [puntosGps])

  // Trayectoria del rango completo, filtrada por turno y en orden cronológico
  const trayectoria = useMemo(() => {
    const filtrados = puntosGps.filter((rev) => {
      if (turno === 'dia') return esTurnoDia(rev.created_at)
      if (turno === 'noche') return !esTurnoDia(rev.created_at)
      return true
    })
    return [...filtrados].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [puntosGps, turno])

  const distanciaTotal = useMemo(() => {
    let metros = 0
    for (let i = 1; i < trayectoria.length; i += 1) {
      metros += haversineMeters(
        trayectoria[i - 1].lat,
        trayectoria[i - 1].lon,
        trayectoria[i].lat,
        trayectoria[i].lon
      )
    }
    return metros
  }, [trayectoria])

  const boundsPoints = useMemo<[number, number][]>(() => {
    if (verTrayectoria && trayectoria.length > 0) {
      return trayectoria.map((rev) => [rev.lat, rev.lon])
    }
    const puntos: [number, number][] = busesSemana.map((rev) => [rev.lat, rev.lon])
    if (live) puntos.push([live.lat, live.lon])
    return puntos
  }, [verTrayectoria, trayectoria, busesSemana, live])

  const colorTrayectoria = turno === 'dia' ? '#f59e0b' : turno === 'noche' ? '#312e81' : '#6366f1'

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
        <MapPin className="h-4 w-4 text-indigo-500" />
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Mapa operativo</p>

        {revisando ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="marker-live-dot inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Revisando {revisando.ppu} ahora · desde {dayjs(revisando.startedAt).format('HH:mm')}
          </span>
        ) : live ? (
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            En línea · sin revisión activa
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Sin señal GPS en vivo
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {verTrayectoria && (
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ['todo', 'Todo', null],
                  ['dia', '08–20', Sun],
                  ['noche', '20–08', Moon],
                ] as [Turno, string, typeof Sun | null][]
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTurno(value)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    turno === value
                      ? 'bg-white text-indigo-700 shadow dark:bg-slate-950 dark:text-indigo-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                  }`}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant={verTrayectoria ? 'default' : 'outline'}
            className="gap-1.5 rounded-xl text-xs"
            onClick={() => setVerTrayectoria((prev) => !prev)}
          >
            <Route className="h-3.5 w-3.5" />
            Trayectoria
          </Button>
        </div>
      </div>

      {puntosGps.length === 0 && !live ? (
        <div className="flex h-40 items-center justify-center text-xs text-slate-400">
          Este colaborador no tiene revisiones con GPS en el rango seleccionado.
        </div>
      ) : (
        <>
          <div className="h-[360px] w-full overflow-hidden">
            <MapContainer
              center={[-33.46, -70.65]}
              zoom={11}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
              />
              <FitBounds points={boundsPoints} />

              {/* Geocercas de terminales */}
              {TERMINAL_GEOFENCES.map((fence) => (
                <Circle
                  key={fence.name}
                  center={[fence.lat, fence.lon]}
                  radius={fence.radius}
                  pathOptions={{ color: '#0ea5e9', fillOpacity: 0.06, weight: 1.5 }}
                />
              ))}

              {/* Trayectoria por turno */}
              {verTrayectoria && trayectoria.length > 1 && (
                <Polyline
                  positions={trayectoria.map((rev) => [rev.lat, rev.lon])}
                  pathOptions={{ color: colorTrayectoria, weight: 3.5, opacity: 0.85, dashArray: '2 8' }}
                />
              )}
              {verTrayectoria &&
                trayectoria.map((rev, index) => (
                  <CircleMarker
                    key={`tray-${rev.id}`}
                    center={[rev.lat, rev.lon]}
                    radius={index === 0 || index === trayectoria.length - 1 ? 7 : 4}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 1.5,
                      fillColor:
                        index === 0
                          ? '#22c55e'
                          : index === trayectoria.length - 1
                          ? '#ef4444'
                          : colorTrayectoria,
                      fillOpacity: 1,
                    }}
                  >
                    <LeafletTooltip direction="top" offset={[0, -6]} className="bus-tooltip">
                      <span className="font-bold">
                        {index === 0 ? '▶ Inicio · ' : index === trayectoria.length - 1 ? '⏹ Fin · ' : `${index + 1}. `}
                        {rev.bus_ppu}
                      </span>
                      <span className="ml-1 opacity-75">
                        {dayjs(rev.created_at).format('DD/MM HH:mm')}
                      </span>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}

              {/* Buses revisados esta semana */}
              {!verTrayectoria &&
                busesSemana.map((rev) => (
                  <Marker
                    key={`sem-${rev.id}`}
                    position={[rev.lat, rev.lon]}
                    icon={busPuntoIcon(rev.estado_bus === 'EN_PANNE')}
                  >
                    <LeafletTooltip direction="top" offset={[0, -10]} className="bus-tooltip">
                      <span className="font-bold">{rev.bus_ppu}</span>
                      <span className="ml-1 opacity-75">
                        · {dayjs(rev.created_at).format('ddd DD HH:mm')} ·{' '}
                        {rev.estado_bus === 'EN_PANNE' ? 'En panne' : 'Operativo'}
                      </span>
                    </LeafletTooltip>
                  </Marker>
                ))}

              {/* Ubicación en vivo del colaborador */}
              {live && (
                <Marker
                  position={[live.lat, live.lon]}
                  icon={liveInspectorIcon(colaborador.nombre, revisando?.ppu ?? null)}
                  zIndexOffset={1000}
                />
              )}
            </MapContainer>
          </div>

          {/* Estadísticas de la vista */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-200/70 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {verTrayectoria ? (
              <>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  <Route className="mr-1 inline h-3 w-3 text-indigo-500" />
                  {trayectoria.length} puntos ·{' '}
                  {distanciaTotal >= 1000
                    ? `${(distanciaTotal / 1000).toFixed(1)} km recorridos`
                    : `${Math.round(distanciaTotal)} m recorridos`}
                </span>
                <span>
                  Turno:{' '}
                  {turno === 'dia'
                    ? '☀️ Día (08:00–20:00)'
                    : turno === 'noche'
                    ? '🌙 Noche (20:00–08:00)'
                    : 'Completo (24 h)'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Inicio
                  <span className="ml-2 inline-block h-2 w-2 rounded-full bg-red-500" /> Fin
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  🚌 {busesSemana.length} bus{busesSemana.length !== 1 ? 'es' : ''} revisado
                  {busesSemana.length !== 1 ? 's' : ''} esta semana
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Operativo
                  <span className="ml-2 inline-block h-2 w-2 rounded-full bg-orange-500" /> En panne
                </span>
                {live && (
                  <span>
                    Señal GPS: {dayjs(live.last_heartbeat).format('HH:mm:ss')} · ±
                    {Math.round(live.accuracy ?? 0)} m
                  </span>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface IpPerformanceDialogProps {
  open: boolean
  onClose: () => void
}

export const IpPerformanceDialog = ({ open, onClose }: IpPerformanceDialogProps) => {
  const [rango, setRango] = useState<Rango>('1m')
  const [selectedRut, setSelectedRut] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const { data: revisiones, isLoading } = useQuery({
    queryKey: ['ip-performance', rango],
    queryFn: () => fetchRevisiones(rango),
    enabled: open,
  })

  const stats = useMemo(() => construirStats(revisiones ?? []), [revisiones])
  const maxTotal = stats[0]?.total ?? 1
  const seleccionado = stats.find((s) => s.rut === selectedRut) ?? null

  // Datos en vivo: ubicación GPS e inspecciones en curso (Presence)
  const { inspectors: activeInspectors } = useActiveInspectors()
  const inspeccionesEnCurso = useInspeccionesEnCurso()
  const liveInspector = seleccionado
    ? activeInspectors.find((inspector) => inspector.usuario_rut === seleccionado.rut)
    : undefined
  const revisandoAhora = seleccionado
    ? inspeccionesEnCurso.find((item) => item.rut === seleccionado.rut)
    : undefined

  const globales = useMemo(() => {
    const totalRevs = stats.reduce((acc, s) => acc + s.total, 0)
    const ipsUnicas = new Set(stats.flatMap((s) => s.ips.map((ip) => ip.ip)))
    ipsUnicas.delete('Sin IP')
    const conGps = stats.reduce((acc, s) => acc + s.conGps, 0)
    const dentro = stats.reduce((acc, s) => acc + s.dentroGeocerca, 0)
    return {
      totalRevs,
      colaboradores: stats.length,
      ipsUnicas: ipsUnicas.size,
      precisionGlobal: conGps > 0 ? (dentro / conGps) * 100 : 0,
    }
  }, [stats])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="relative bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-600 px-6 py-5 text-white">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap items-center gap-4">
                {seleccionado && (
                  <button
                    type="button"
                    onClick={() => setSelectedRut(null)}
                    className="rounded-full border border-white/20 bg-slate-950/30 p-2 transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="rounded-2xl bg-white/15 p-3">
                  {seleccionado ? <User className="h-7 w-7" /> : <Globe className="h-7 w-7" />}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black">
                    {seleccionado ? seleccionado.nombre : 'Rendimiento por IP y colaborador'}
                  </h2>
                  <p className="text-sm text-white/80">
                    {seleccionado
                      ? `${seleccionado.rut} · Ranking #${stats.findIndex((s) => s.rut === seleccionado.rut) + 1} de ${stats.length}`
                      : 'Ranking de revisiones, precisión GPS y trazabilidad de IPs'}
                  </p>
                </div>
                <div className="ml-auto flex gap-1 rounded-2xl border border-white/15 bg-slate-950/30 p-1">
                  {(
                    [
                      ['1m', '1 mes'],
                      ['2m', '2 meses'],
                      ['all', 'Todo'],
                    ] as [Rango, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRango(value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        rango === value
                          ? 'bg-white text-indigo-700 shadow'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPIs globales o del colaborador */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(seleccionado
                  ? [
                      { label: 'Revisiones', value: seleccionado.total, icon: Activity },
                      {
                        label: 'Precisión GPS',
                        value: `${seleccionado.precision.toFixed(0)}%`,
                        icon: Crosshair,
                      },
                      {
                        label: 'Dist. promedio a terminal',
                        value: `${seleccionado.distanciaPromedio} m`,
                        icon: MapPin,
                      },
                      { label: 'IPs distintas', value: seleccionado.ips.length, icon: Globe },
                    ]
                  : [
                      { label: 'Revisiones totales', value: globales.totalRevs, icon: Activity },
                      { label: 'Colaboradores', value: globales.colaboradores, icon: User },
                      { label: 'IPs distintas', value: globales.ipsUnicas, icon: Globe },
                      {
                        label: 'Precisión global',
                        value: `${globales.precisionGlobal.toFixed(0)}%`,
                        icon: Crosshair,
                      },
                    ]
                ).map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-white/15 bg-slate-950/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/70">
                      <kpi.icon className="h-3 w-3" /> {kpi.label}
                    </div>
                    <p className="mt-0.5 text-lg font-bold text-white">{kpi.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                  Analizando revisiones, IPs y precisión GPS…
                </div>
              ) : stats.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                  <Globe className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Sin revisiones en el rango seleccionado
                  </p>
                </div>
              ) : seleccionado ? (
                /* ---------- DETALLE POR COLABORADOR ---------- */
                <div className="space-y-5">
                  {/* Resumen operativo */}
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                      {
                        label: 'Buses operativos',
                        value: seleccionado.operativos,
                        cls: 'text-emerald-600 dark:text-emerald-400',
                      },
                      {
                        label: 'Buses en panne',
                        value: seleccionado.panne,
                        cls: 'text-orange-600 dark:text-orange-400',
                      },
                      { label: 'Días activos', value: seleccionado.diasActivos, cls: '' },
                      {
                        label: 'Prom. por día activo',
                        value: (seleccionado.total / Math.max(seleccionado.diasActivos, 1)).toFixed(1),
                        cls: '',
                      },
                      {
                        label: 'Terminales cubiertos',
                        value: seleccionado.terminales.length,
                        cls: '',
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-slate-200/70 px-3 py-2.5 dark:border-slate-800"
                      >
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          {item.label}
                        </p>
                        <p className={`text-lg font-bold text-slate-800 dark:text-slate-100 ${item.cls}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Mapa operativo en vivo */}
                  <MapaOperativo
                    colaborador={seleccionado}
                    live={liveInspector}
                    revisando={revisandoAhora}
                  />

                  {/* IPs utilizadas */}
                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800">
                    <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                      <ShieldCheck className="h-4 w-4 text-indigo-500" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        IPs utilizadas ({seleccionado.ips.length})
                      </p>
                      <span className="ml-auto text-[11px] text-slate-400">
                        Activo del {dayjs(seleccionado.primeraActividad).format('DD/MM/YY')} al{' '}
                        {dayjs(seleccionado.ultimaActividad).format('DD/MM/YY')}
                      </span>
                    </div>
                    <div className="max-h-52 overflow-auto overscroll-contain">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                          <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                            <th className="px-4 py-2">Dirección IP</th>
                            <th className="px-4 py-2">Revisiones</th>
                            <th className="px-4 py-2">Red / Ciudad</th>
                            <th className="px-4 py-2">Primera vez</th>
                            <th className="px-4 py-2">Última vez</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seleccionado.ips.map((ip) => (
                            <tr key={ip.ip} className="border-t border-slate-100 dark:border-slate-800/60">
                              <td className="px-4 py-2.5">
                                <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {ip.ip}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100">
                                {ip.usos}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">{ip.ciudad}</td>
                              <td className="px-4 py-2.5 text-slate-500">
                                {dayjs(ip.primeraVez).format('DD/MM/YY HH:mm')}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">
                                {dayjs(ip.ultimaVez).format('DD/MM/YY HH:mm')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Revisiones con precisión */}
                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800">
                    <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                      <Bus className="h-4 w-4 text-indigo-500" />
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Revisiones y precisión de ubicación ({seleccionado.total})
                      </p>
                    </div>
                    <div className="max-h-72 overflow-auto overscroll-contain">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                          <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                            <th className="px-4 py-2">Fecha y hora</th>
                            <th className="px-4 py-2">Bus</th>
                            <th className="px-4 py-2">Estado</th>
                            <th className="px-4 py-2">Terminal</th>
                            <th className="px-4 py-2">Precisión GPS</th>
                            <th className="px-4 py-2">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seleccionado.revisiones.map((rev) => {
                            const conGps =
                              typeof rev.lat === 'number' && typeof rev.lon === 'number' && rev.lat !== 0
                            const medida = conGps ? closestTerminalDistance(rev.lat, rev.lon) : null
                            return (
                              <tr key={rev.id} className="border-t border-slate-100 dark:border-slate-800/60">
                                <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                                  {dayjs(rev.created_at).format('DD/MM/YY HH:mm')}
                                </td>
                                <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100">
                                  {rev.bus_ppu}
                                  <span className="ml-1 font-normal text-slate-400">
                                    ({rev.bus_interno})
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {rev.estado_bus === 'EN_PANNE' ? (
                                    <Badge variant="danger" className="px-1.5 py-0 text-[9px]">
                                      EN PANNE
                                    </Badge>
                                  ) : (
                                    <Badge variant="success" className="px-1.5 py-0 text-[9px]">
                                      OPERATIVO
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-slate-500">
                                  {rev.terminal_detectado || rev.terminal_reportado}
                                </td>
                                <td className="px-4 py-2.5">
                                  {medida ? (
                                    medida.inside ? (
                                      <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3 w-3" /> En {medida.terminal} (
                                        {medida.distance} m)
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                                        <AlertTriangle className="h-3 w-3" /> Fuera de geocerca (
                                        {medida.distance >= 1000
                                          ? `${(medida.distance / 1000).toFixed(1)} km`
                                          : `${medida.distance} m`}
                                        )
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400">Sin GPS</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                                  {rev.ip_address ?? '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* ---------- RANKING ---------- */
                <div className="space-y-2">
                  <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    <Medal className="h-4 w-4 text-amber-500" /> Ranking de colaboradores · clic para
                    ver el informe individual
                  </p>
                  {stats.map((colaborador, index) => (
                    <button
                      key={colaborador.rut}
                      type="button"
                      onClick={() => setSelectedRut(colaborador.rut)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200/70 px-4 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20"
                    >
                      <span className="w-10 shrink-0 text-center text-lg font-black text-slate-500">
                        {medalla(index)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                            <span className="truncate">{colaborador.nombre}</span>
                            <span className="shrink-0 text-xs font-normal text-slate-400">
                              {colaborador.rut}
                            </span>
                            {(() => {
                              const enCurso = inspeccionesEnCurso.find(
                                (item) => item.rut === colaborador.rut
                              )
                              return enCurso ? (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  <span className="marker-live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Revisando {enCurso.ppu}
                                </span>
                              ) : null
                            })()}
                          </p>
                          <p className="shrink-0 text-sm font-black text-slate-800 dark:text-slate-100">
                            {colaborador.total}
                            <span className="ml-1 text-[10px] font-normal uppercase text-slate-400">
                              rev.
                            </span>
                          </p>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                            style={{ width: `${Math.max((colaborador.total / maxTotal) * 100, 4)}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span className={`flex items-center gap-1 font-semibold ${precisionColor(colaborador.precision)}`}>
                            <Crosshair className="h-3 w-3" />
                            {colaborador.conGps > 0
                              ? `${colaborador.precision.toFixed(0)}% precisión`
                              : 'Sin GPS'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" /> {colaborador.ips.length} IP
                            {colaborador.ips.length !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {colaborador.terminales.length} terminal
                            {colaborador.terminales.length !== 1 ? 'es' : ''}
                          </span>
                          {colaborador.panne > 0 && (
                            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                              <AlertTriangle className="h-3 w-3" /> {colaborador.panne} en panne
                            </span>
                          )}
                          <span className="ml-auto">
                            Última: {dayjs(colaborador.ultimaActividad).format('DD/MM HH:mm')}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pie */}
            <div className="flex items-center justify-between border-t border-slate-200/70 px-6 py-3 dark:border-slate-800">
              <p className="text-[11px] text-slate-400">
                Precisión = % de revisiones realizadas dentro de la geocerca de un terminal
              </p>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
