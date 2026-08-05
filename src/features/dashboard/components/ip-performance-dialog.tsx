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
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Globe,
  MapPin,
  Medal,
  Moon,
  Route,
  Sun,
  FileDown,
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
import {
  analizarRendimiento,
  construirPeriodo,
  formatearMinutos,
  type Severidad,
} from '@/features/dashboard/lib/analisis-rendimiento'
import { generarInformeRendimiento } from '@/features/dashboard/lib/pdf-rendimiento'

type RevisionRow = Tables<'revisiones'>
type Rango = 'semana' | '1m' | '2m' | 'all'
type ModoDetalle = 'semana' | '1m' | '2m' | 'all'

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
  precision: number
  busesDistintos: number
  ipsDistintas: number
  terminales: string[]
  diasActivos: number
  ultimaActividad: string
}

const fetchRevisionesRango = async (
  rango: Rango,
  semanaOffset = 0
): Promise<RevisionRow[]> => {
  let query = supabase
    .from('revisiones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (rango === 'semana') {
    const inicio = dayjs().isoWeekday(1).startOf('day').add(semanaOffset, 'week')
    query = query
      .gte('created_at', inicio.toISOString())
      .lt('created_at', inicio.add(7, 'day').toISOString())
  } else if (rango !== 'all') {
    query = query.gte(
      'created_at',
      dayjs().subtract(rango === '1m' ? 1 : 2, 'month').toISOString()
    )
  }

  const { data } = await query
  return (data as RevisionRow[]) ?? []
}

const conGpsValido = (rev: RevisionRow) =>
  typeof rev.lat === 'number' && typeof rev.lon === 'number' && rev.lat !== 0

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
    const gps = revs.filter(conGpsValido)
    const medidas = gps.map((rev) => closestTerminalDistance(rev.lat, rev.lon))
    const dentro = medidas.filter((m) => m.inside).length
    const dias = new Set(revs.map((rev) => dayjs(rev.created_at).format('YYYY-MM-DD')))

    stats.push({
      rut: revs[0].inspector_rut,
      nombre: revs[0].inspector_nombre,
      revisiones: revs,
      total: revs.length,
      operativos: revs.filter((rev) => rev.estado_bus === 'OPERATIVO').length,
      panne: revs.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
      dentroGeocerca: dentro,
      conGps: gps.length,
      distanciaPromedio:
        medidas.length > 0
          ? Math.round(medidas.reduce((acc, m) => acc + m.distance, 0) / medidas.length)
          : 0,
      precision: gps.length > 0 ? (dentro / gps.length) * 100 : 0,
      busesDistintos: new Set(revs.map((rev) => rev.bus_ppu)).size,
      ipsDistintas: new Set(revs.map((rev) => rev.ip_address).filter(Boolean)).size,
      terminales: [...new Set(revs.map((rev) => rev.terminal_detectado || rev.terminal_reportado))],
      diasActivos: dias.size,
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
// MAPA OPERATIVO: ubicación en vivo, buses del período,
// "revisando ahora" en verde y trayectoria por turno.
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
  nombre,
  revisiones,
  periodoLabel,
  live,
  revisando,
}: {
  nombre: string
  revisiones: RevisionRow[]
  periodoLabel: string
  live?: Tables<'usuarios_activos'>
  revisando?: { ppu: string; startedAt: string }
}) => {
  const [verTrayectoria, setVerTrayectoria] = useState(false)
  const [turno, setTurno] = useState<Turno>('todo')

  const puntosGps = useMemo(() => revisiones.filter(conGpsValido), [revisiones])

  // Último punto por PPU dentro del período seleccionado
  const busesPeriodo = useMemo(() => {
    const porPpu = new Map<string, RevisionRow>()
    puntosGps.forEach((rev) => {
      if (!porPpu.has(rev.bus_ppu)) porPpu.set(rev.bus_ppu, rev)
    })
    return [...porPpu.values()]
  }, [puntosGps])

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
    const puntos: [number, number][] = busesPeriodo.map((rev) => [rev.lat, rev.lon])
    if (live) puntos.push([live.lat, live.lon])
    return puntos
  }, [verTrayectoria, trayectoria, busesPeriodo, live])

  const colorTrayectoria = turno === 'dia' ? '#f59e0b' : turno === 'noche' ? '#312e81' : '#6366f1'

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800">
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
          Sin revisiones con GPS ni señal en vivo en este período.
        </div>
      ) : (
        <>
          <div className="h-[340px] w-full">
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

              {TERMINAL_GEOFENCES.map((fence) => (
                <Circle
                  key={fence.name}
                  center={[fence.lat, fence.lon]}
                  radius={fence.radius}
                  pathOptions={{ color: '#0ea5e9', fillOpacity: 0.06, weight: 1.5 }}
                />
              ))}

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

              {!verTrayectoria &&
                busesPeriodo.map((rev) => (
                  <Marker
                    key={`per-${rev.id}`}
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

              {live && (
                <Marker
                  position={[live.lat, live.lon]}
                  icon={liveInspectorIcon(nombre, revisando?.ppu ?? null)}
                  zIndexOffset={1000}
                />
              )}
            </MapContainer>
          </div>

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
                  🚌 {busesPeriodo.length} bus{busesPeriodo.length !== 1 ? 'es' : ''} revisado
                  {busesPeriodo.length !== 1 ? 's' : ''} · {periodoLabel}
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

// ============================================================
// DIALOGO PRINCIPAL
// ============================================================

interface IpPerformanceDialogProps {
  open: boolean
  onClose: () => void
}

export const IpPerformanceDialog = ({ open, onClose }: IpPerformanceDialogProps) => {
  const [rango, setRango] = useState<Rango>('semana')
  const [rankingSemanaOffset, setRankingSemanaOffset] = useState(0)
  const [seleccion, setSeleccion] = useState<{ rut: string; nombre: string } | null>(null)
  const [modoDetalle, setModoDetalle] = useState<ModoDetalle>('semana')
  const [semanaOffset, setSemanaOffset] = useState(0)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Ranking global (según rango del encabezado)
  const { data: revisiones, isLoading } = useQuery({
    queryKey: ['ip-performance', rango, rango === 'semana' ? rankingSemanaOffset : 0],
    queryFn: () => fetchRevisionesRango(rango, rankingSemanaOffset),
    enabled: open,
  })

  // Semana mostrada en el ranking
  const rankingSemanaInicio = useMemo(
    () => dayjs().isoWeekday(1).startOf('day').add(rankingSemanaOffset, 'week'),
    [rankingSemanaOffset]
  )
  const rankingPeriodoLabel = useMemo(() => {
    if (rango === 'semana')
      return `Semana ${rankingSemanaInicio.isoWeek()} · ${rankingSemanaInicio.format(
        'DD MMM'
      )} – ${rankingSemanaInicio.add(6, 'day').format('DD MMM')}`
    if (rango === '1m') return 'Último mes'
    if (rango === '2m') return 'Últimos 2 meses'
    return 'Historial completo'
  }, [rango, rankingSemanaInicio])

  // Historial COMPLETO del colaborador seleccionado (independiente del rango)
  const { data: detalleRevs, isLoading: loadingDetalle } = useQuery({
    queryKey: ['ip-detalle', seleccion?.rut],
    queryFn: async () => {
      const { data } = await supabase
        .from('revisiones')
        .select('*')
        .eq('inspector_rut', seleccion?.rut as string)
        .order('created_at', { ascending: false })
        .limit(5000)
      return (data as RevisionRow[]) ?? []
    },
    enabled: open && Boolean(seleccion),
  })

  const stats = useMemo(() => construirStats(revisiones ?? []), [revisiones])
  const maxTotal = stats[0]?.total ?? 1

  // Semana seleccionada en el detalle
  const semanaInicio = useMemo(
    () => dayjs().isoWeekday(1).startOf('day').add(semanaOffset, 'week'),
    [semanaOffset]
  )
  const semanaFin = useMemo(() => semanaInicio.add(7, 'day'), [semanaInicio])

  const periodoLabel = useMemo(() => {
    if (modoDetalle === 'semana')
      return `Semana ${semanaInicio.isoWeek()} · ${semanaInicio.format('DD MMM')} – ${semanaFin
        .subtract(1, 'day')
        .format('DD MMM')}`
    if (modoDetalle === '1m') return 'Último mes'
    if (modoDetalle === '2m') return 'Últimos 2 meses'
    return 'Historial completo'
  }, [modoDetalle, semanaInicio, semanaFin])

  const detalleFiltradas = useMemo(() => {
    if (!detalleRevs) return []
    if (modoDetalle === 'semana') {
      return detalleRevs.filter((rev) => {
        const fecha = dayjs(rev.created_at)
        return !fecha.isBefore(semanaInicio) && fecha.isBefore(semanaFin)
      })
    }
    if (modoDetalle === 'all') return detalleRevs
    const desde = dayjs().subtract(modoDetalle === '1m' ? 1 : 2, 'month')
    return detalleRevs.filter((rev) => dayjs(rev.created_at).isAfter(desde))
  }, [detalleRevs, modoDetalle, semanaInicio, semanaFin])

  const detalleStats = useMemo(
    () => construirStats(detalleFiltradas)[0] ?? null,
    [detalleFiltradas]
  )

  /**
   * Chequeo de rendimiento del colaborador para el período visible.
   *
   * `inicioActividad` sale del historial completo, no del filtrado: sin ese
   * dato, analizar "los últimos dos meses" de alguien que entró hace tres
   * semanas lo acusaría de faltar cinco semanas enteras.
   */
  const analisis = useMemo(() => {
    if (!seleccion) return null
    const primera = detalleRevs?.length
      ? detalleRevs[detalleRevs.length - 1].created_at
      : undefined
    const periodo = construirPeriodo(modoDetalle, semanaInicio, primera)
    return analizarRendimiento(detalleFiltradas, periodo, {
      rut: seleccion.rut,
      nombre: seleccion.nombre,
      inicioActividad: primera,
    })
  }, [seleccion, detalleRevs, detalleFiltradas, modoDetalle, semanaInicio])

  const [generandoPdf, setGenerandoPdf] = useState(false)

  const descargarInforme = () => {
    if (!analisis) return
    setGenerandoPdf(true)
    try {
      generarInformeRendimiento(analisis)
    } catch (error) {
      console.error('No se pudo generar el informe de rendimiento', error)
    } finally {
      setGenerandoPdf(false)
    }
  }

  // Buses revisados agrupados por día (más reciente primero)
  const busesPorDia = useMemo(() => {
    const grupos = new Map<string, RevisionRow[]>()
    detalleFiltradas.forEach((rev) => {
      const key = dayjs(rev.created_at).format('YYYY-MM-DD')
      const list = grupos.get(key)
      if (list) list.push(rev)
      else grupos.set(key, [rev])
    })
    return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [detalleFiltradas])

  // Datos en vivo
  const { inspectors: activeInspectors } = useActiveInspectors()
  const inspeccionesEnCurso = useInspeccionesEnCurso()
  const liveInspector = seleccion
    ? activeInspectors.find((inspector) => inspector.usuario_rut === seleccion.rut)
    : undefined
  const revisandoAhora = seleccion
    ? inspeccionesEnCurso.find((item) => item.rut === seleccion.rut)
    : undefined

  const abrirDetalle = (rut: string, nombre: string) => {
    setSeleccion({ rut, nombre })
    setModoDetalle('semana')
    setSemanaOffset(0)
  }

  const globales = useMemo(() => {
    const totalRevs = stats.reduce((acc, s) => acc + s.total, 0)
    const conGps = stats.reduce((acc, s) => acc + s.conGps, 0)
    const dentro = stats.reduce((acc, s) => acc + s.dentroGeocerca, 0)
    return {
      totalRevs,
      colaboradores: stats.length,
      buses: new Set((revisiones ?? []).map((rev) => rev.bus_ppu)).size,
      precisionGlobal: conGps > 0 ? (dentro / conGps) * 100 : 0,
    }
  }, [stats, revisiones])

  const kpisHeader = seleccion
    ? [
        { label: periodoLabel, value: detalleStats?.total ?? 0, icon: Activity },
        { label: 'Buses distintos', value: detalleStats?.busesDistintos ?? 0, icon: Bus },
        {
          label: 'Precisión GPS',
          value: detalleStats && detalleStats.conGps > 0 ? `${detalleStats.precision.toFixed(0)}%` : '—',
          icon: Crosshair,
        },
        {
          label: 'Dist. prom. a terminal',
          value: detalleStats && detalleStats.conGps > 0 ? `${detalleStats.distanciaPromedio} m` : '—',
          icon: MapPin,
        },
      ]
    : [
        { label: rankingPeriodoLabel, value: globales.totalRevs, icon: Activity },
        { label: 'Colaboradores', value: globales.colaboradores, icon: User },
        { label: 'Buses distintos', value: globales.buses, icon: Bus },
        {
          label: 'Precisión global',
          value: `${globales.precisionGlobal.toFixed(0)}%`,
          icon: Crosshair,
        },
      ]

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md sm:p-5"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-panel-strong flex h-[100dvh] w-full flex-col overflow-hidden shadow-2xl sm:h-[92vh] sm:max-w-5xl sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="relative bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-600 px-4 py-4 text-white sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar rendimiento por colaborador"
                className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex flex-wrap items-center gap-4">
                {seleccion && (
                  <button
                    type="button"
                    onClick={() => setSeleccion(null)}
                    className="rounded-full border border-white/20 bg-slate-950/30 p-2 transition hover:bg-white/15"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="rounded-2xl bg-white/15 p-3">
                  {seleccion ? <User className="h-7 w-7" /> : <Globe className="h-7 w-7" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-black">
                      {seleccion ? seleccion.nombre : 'Rendimiento por colaborador'}
                    </h2>
                    {seleccion && revisandoAhora && (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">
                        <span className="marker-live-dot inline-block h-2 w-2 rounded-full bg-white" />
                        Revisando {revisandoAhora.ppu}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/80">
                    {seleccion
                      ? `${seleccion.rut} · Informe semanal de actividad`
                      : 'Ranking de revisiones, precisión GPS y trazabilidad'}
                  </p>
                </div>
                {!seleccion && (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <div className="flex gap-1 rounded-2xl border border-white/15 bg-slate-950/30 p-1">
                      {(
                        [
                          ['semana', 'Semanal'],
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

                    {/* Navegación entre semanas del ranking */}
                    {rango === 'semana' && (
                      <div className="flex items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/30 p-1">
                        <button
                          type="button"
                          onClick={() => setRankingSemanaOffset((prev) => prev - 1)}
                          className="rounded-xl p-1.5 text-white/80 transition hover:bg-white/10"
                          aria-label="Semana anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[150px] text-center text-[11px] font-bold text-white">
                          {rankingPeriodoLabel}
                        </span>
                        <button
                          type="button"
                          disabled={rankingSemanaOffset >= 0}
                          onClick={() => setRankingSemanaOffset((prev) => Math.min(prev + 1, 0))}
                          className="rounded-xl p-1.5 text-white/80 transition hover:bg-white/10 disabled:opacity-30"
                          aria-label="Semana siguiente"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        {rankingSemanaOffset !== 0 && (
                          <button
                            type="button"
                            onClick={() => setRankingSemanaOffset(0)}
                            className="rounded-xl px-2 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            Hoy
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {kpisHeader.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-white/15 bg-slate-950/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-1.5 truncate text-[10px] uppercase tracking-wide text-white/70">
                      <kpi.icon className="h-3 w-3 shrink-0" /> {kpi.label}
                    </div>
                    <p className="mt-0.5 text-lg font-bold text-white">{kpi.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4">
              {seleccion ? (
                /* ================= DETALLE ================= */
                <div className="space-y-4">
                  {/* Barra de período: semanas navegables + rangos */}
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm dark:bg-slate-950">
                      {(
                        [
                          ['semana', 'Semanal'],
                          ['1m', '1 mes'],
                          ['2m', '2 meses'],
                          ['all', 'Todo'],
                        ] as [ModoDetalle, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setModoDetalle(value)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            modoDetalle === value
                              ? 'bg-indigo-600 text-white shadow'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {modoDetalle === 'semana' && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-xl"
                          onClick={() => setSemanaOffset((prev) => prev - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="min-w-0 flex-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-center text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 sm:min-w-[190px] sm:flex-initial sm:px-3 sm:text-xs">
                          {periodoLabel}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-xl"
                          disabled={semanaOffset >= 0}
                          onClick={() => setSemanaOffset((prev) => Math.min(prev + 1, 0))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        {semanaOffset !== 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setSemanaOffset(0)}
                          >
                            Hoy
                          </Button>
                        )}
                      </div>
                    )}

                    <span className="ml-auto text-[11px] text-slate-400">
                      {detalleStats
                        ? `${detalleStats.operativos} operativos · ${detalleStats.panne} en panne · ${detalleStats.diasActivos} día${detalleStats.diasActivos !== 1 ? 's' : ''} activo${detalleStats.diasActivos !== 1 ? 's' : ''}`
                        : 'Sin actividad en el período'}
                    </span>

                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={generandoPdf || !analisis}
                      onClick={descargarInforme}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      {generandoPdf ? 'Generando…' : 'Informe PDF'}
                    </Button>
                  </div>

                  {/* Chequeo de rendimiento del período seleccionado */}
                  {analisis && <PanelRendimiento analisis={analisis} />}

                  {loadingDetalle ? (
                    <div className="flex h-56 items-center justify-center text-sm text-slate-400">
                      Cargando historial del colaborador…
                    </div>
                  ) : (
                    <>
                      {/* Mapa en vivo del período */}
                      <MapaOperativo
                        nombre={seleccion.nombre}
                        revisiones={detalleFiltradas}
                        periodoLabel={periodoLabel}
                        live={liveInspector}
                        revisando={revisandoAhora}
                      />

                      {/* Buses revisados: qué y cuándo */}
                      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800">
                        <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
                          <Bus className="h-4 w-4 text-indigo-500" />
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            Buses revisados · {periodoLabel}
                          </p>
                          <span className="ml-auto rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                            {detalleFiltradas.length} revisión
                            {detalleFiltradas.length !== 1 ? 'es' : ''}
                          </span>
                        </div>

                        {busesPorDia.length === 0 ? (
                          <div className="flex h-32 flex-col items-center justify-center gap-1 text-center">
                            <Bus className="h-7 w-7 text-slate-300" />
                            <p className="text-xs text-slate-400">
                              Sin revisiones en este período. Usa las flechas para cambiar de semana.
                            </p>
                          </div>
                        ) : (
                          <div className="max-h-[380px] overflow-y-auto overscroll-contain">
                            {busesPorDia.map(([dia, revs]) => (
                              <div key={dia}>
                                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200/60 bg-slate-50 px-4 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {dayjs(dia).format('dddd DD MMMM YYYY')}
                                  </p>
                                  <span className="text-[10px] text-slate-400">
                                    {revs.length} bus{revs.length !== 1 ? 'es' : ''}
                                  </span>
                                </div>
                                {revs.map((rev) => {
                                  const gps = conGpsValido(rev)
                                  const medida = gps ? closestTerminalDistance(rev.lat, rev.lon) : null
                                  return (
                                    <div
                                      key={rev.id}
                                      className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-slate-800/50"
                                    >
                                      <span className="w-12 shrink-0 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                                        {dayjs(rev.created_at).format('HH:mm')}
                                      </span>
                                      <span
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                                          rev.estado_bus === 'EN_PANNE'
                                            ? 'bg-orange-100 dark:bg-orange-950/50'
                                            : 'bg-emerald-100 dark:bg-emerald-950/50'
                                        }`}
                                      >
                                        🚌
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                          {rev.bus_ppu}
                                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                                            N° {rev.bus_interno}
                                          </span>
                                        </p>
                                        <p className="truncate text-[11px] text-slate-500">
                                          {rev.terminal_detectado || rev.terminal_reportado} · Semana{' '}
                                          {rev.semana_iso}
                                          {rev.observaciones ? ` · "${rev.observaciones}"` : ''}
                                        </p>
                                      </div>
                                      {rev.estado_bus === 'EN_PANNE' ? (
                                        <Badge variant="danger" className="shrink-0 px-1.5 py-0 text-[9px]">
                                          EN PANNE
                                        </Badge>
                                      ) : (
                                        <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[9px]">
                                          OPERATIVO
                                        </Badge>
                                      )}
                                      <span className="hidden w-40 shrink-0 text-right sm:block">
                                        {medida ? (
                                          medida.inside ? (
                                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                              <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                                              {medida.terminal} · {medida.distance} m
                                            </span>
                                          ) : (
                                            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                                              <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                                              Fuera ·{' '}
                                              {medida.distance >= 1000
                                                ? `${(medida.distance / 1000).toFixed(1)} km`
                                                : `${medida.distance} m`}
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-[11px] text-slate-400">Sin GPS</span>
                                        )}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : isLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                  Analizando revisiones y precisión GPS…
                </div>
              ) : stats.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                  <Globe className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Sin revisiones en {rankingPeriodoLabel.toLowerCase()}
                  </p>
                  {rango === 'semana' && (
                    <p className="text-xs text-slate-400">
                      Usa las flechas del encabezado para cambiar de semana
                    </p>
                  )}
                </div>
              ) : (
                /* ================= RANKING ================= */
                <div className="space-y-2">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                      <Medal className="h-4 w-4 text-amber-500" /> Ranking de colaboradores
                    </p>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {rankingPeriodoLabel}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Clic en un colaborador para su informe individual
                    </span>
                  </div>
                  {stats.map((colaborador, index) => {
                    const enCurso = inspeccionesEnCurso.find((item) => item.rut === colaborador.rut)
                    return (
                      <button
                        key={colaborador.rut}
                        type="button"
                        onClick={() => abrirDetalle(colaborador.rut, colaborador.nombre)}
                        className="flex w-full items-center gap-2.5 rounded-2xl border border-slate-200/70 px-3 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20 sm:gap-4 sm:px-4"
                      >
                        <span className="w-7 shrink-0 text-center text-base font-black text-slate-500 sm:w-10 sm:text-lg">
                          {medalla(index)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                              <span className="truncate">{colaborador.nombre}</span>
                              <span className="shrink-0 text-xs font-normal text-slate-400">
                                {colaborador.rut}
                              </span>
                              {enCurso && (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  <span className="marker-live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Revisando {enCurso.ppu}
                                </span>
                              )}
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
                            <span
                              className={`flex items-center gap-1 font-semibold ${precisionColor(colaborador.precision)}`}
                            >
                              <Crosshair className="h-3 w-3" />
                              {colaborador.conGps > 0
                                ? `${colaborador.precision.toFixed(0)}% precisión`
                                : 'Sin GPS'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Bus className="h-3 w-3" /> {colaborador.busesDistintos} bus
                              {colaborador.busesDistintos !== 1 ? 'es' : ''}
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
                    )
                  })}
                </div>
              )}
            </div>

            {/* Pie */}
            <div className="flex items-center justify-between border-t border-slate-200/70 px-4 py-2.5 dark:border-slate-800 sm:px-6 sm:py-3">
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

/* -------------------------------------------------------------------------
   Chequeo de rendimiento en pantalla

   Es el mismo análisis que alimenta el PDF: se muestra aquí para que el
   supervisor no tenga que descargar un archivo sólo para saber si hay algo
   que mirar.
   ------------------------------------------------------------------------- */

const TONO_SEVERIDAD: Record<Severidad, string> = {
  critica: 'border-red-300/60 bg-red-50/70 dark:border-red-500/25 dark:bg-red-950/30',
  alta: 'border-orange-300/60 bg-orange-50/70 dark:border-orange-500/25 dark:bg-orange-950/25',
  media: 'border-amber-300/60 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-950/25',
  info: 'border-blue-300/50 bg-blue-50/60 dark:border-blue-500/20 dark:bg-blue-950/25',
}

const TEXTO_SEVERIDAD: Record<Severidad, string> = {
  critica: 'text-red-700 dark:text-red-300',
  alta: 'text-orange-700 dark:text-orange-300',
  media: 'text-amber-700 dark:text-amber-300',
  info: 'text-blue-700 dark:text-blue-300',
}

const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  info: 'Info',
}

const PanelRendimiento = ({
  analisis,
}: {
  analisis: ReturnType<typeof analizarRendimiento>
}) => {
  const maxSemana = Math.max(1, ...analisis.porSemana.map((s) => s.revisiones))

  const colorNota =
    analisis.puntuacion >= 85
      ? 'from-emerald-500 to-emerald-600'
      : analisis.puntuacion >= 70
        ? 'from-brand-500 to-violet-600'
        : analisis.puntuacion >= 50
          ? 'from-amber-500 to-orange-600'
          : 'from-red-500 to-red-600'

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${colorNota} text-white shadow-md`}
        >
          <span className="text-[19px] font-black leading-none tabular-nums">
            {analisis.puntuacion}
          </span>
          <span className="text-[8px] font-bold uppercase tracking-wide opacity-80">
            /100
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
            Chequeo de rendimiento · {analisis.notaGlobal}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {analisis.diasActivos} de {analisis.diasLaborables} días laborables con
            actividad · racha máxima de {analisis.rachaMaxima} días
          </p>
        </div>
      </div>

      {/* Componentes de la nota */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {analisis.componentes.map((componente) => (
          <div
            key={componente.etiqueta}
            className="rounded-xl border border-white/60 bg-white/50 p-2 dark:border-white/[0.06] dark:bg-white/[0.035]"
          >
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
              {componente.etiqueta}
            </p>
            <p className="text-[15px] font-extrabold tabular-nums text-slate-900 dark:text-white">
              {componente.valor}
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.min(100, componente.valor)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Patrón de turnos: el descanso entre jornadas no cuenta como pausa */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <DatoRitmo
          etiqueta="Turnos"
          valor={String(analisis.patron.totalTurnos)}
          nota={`${analisis.patron.turnosDia} día · ${analisis.patron.turnosNoche} noche`}
        />
        <DatoRitmo
          etiqueta={
            analisis.patron.turnoDominante === 'noche' ? 'Horario · noche' : 'Horario · día'
          }
          valor={(() => {
            // Se muestra el horario del tipo de turno predominante: mezclar
            // día y noche daría una hora media que esta persona nunca hace.
            const tipo =
              analisis.patron.turnoDominante === 'noche' ? 'noche' : 'dia'
            const horario = analisis.patron.horarios[tipo]
            return horario.entrada ? `${horario.entrada}–${horario.salida}` : '—'
          })()}
          nota={
            analisis.patron.turnoDominante === 'mixto'
              ? `mixto · ${formatearMinutos(analisis.patron.duracionMedianaMin)} por turno`
              : formatearMinutos(analisis.patron.duracionMedianaMin)
          }
        />
        <DatoRitmo
          etiqueta="Ritmo en turno"
          valor={
            analisis.patron.ritmoMedioPorHora !== null
              ? `${analisis.patron.ritmoMedioPorHora}/h`
              : '—'
          }
          nota={`${analisis.patron.revisionesPorTurno ?? '—'} por turno`}
        />
        <DatoRitmo
          etiqueta="Pausa máx. en turno"
          valor={formatearMinutos(analisis.pausaMaximaMin)}
          nota={
            analisis.pausaMaximaTurno
              ? `${dayjs(analisis.pausaMaximaTurno.fechaJornada).format('DD MMM')} · ${
                  analisis.pausaMaximaTurno.tipo === 'noche' ? 'noche' : 'día'
                }`
              : 'sin pausas'
          }
        />
      </div>

      {/* Evolución semanal */}
      {analisis.porSemana.length > 1 && (
        <div>
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
            Evolución semanal
          </p>
          <div className="flex items-end gap-1 overflow-x-auto pb-1">
            {analisis.porSemana.map((semana) => (
              <div
                key={semana.clave}
                className="flex w-9 shrink-0 flex-col items-center gap-1"
                title={`Semana ${semana.numero}: ${semana.revisiones} revisiones`}
              >
                <span className="text-[9px] font-bold tabular-nums text-slate-500">
                  {semana.revisiones}
                </span>
                <div className="flex h-14 w-full items-end">
                  <div
                    className={`w-full rounded-t-md ${
                      semana.ausente
                        ? 'bg-red-300 dark:bg-red-900/60'
                        : semana.clave === analisis.mejorSemana?.clave
                          ? 'bg-gradient-to-t from-brand-600 to-brand-400'
                          : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{
                      height: `${Math.max(
                        semana.ausente ? 4 : 8,
                        (semana.revisiones / maxSemana) * 100
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-[8.5px] font-semibold text-slate-400">
                  S{semana.numero}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas */}
      <div className="space-y-1.5">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          Alertas ({analisis.alertas.length})
        </p>
        {analisis.alertas.slice(0, 6).map((alerta, indice) => (
          <div
            key={`${alerta.titulo}-${indice}`}
            className={`rounded-xl border px-2.5 py-2 ${TONO_SEVERIDAD[alerta.severidad]}`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[8.5px] font-black uppercase tracking-[0.1em] ${TEXTO_SEVERIDAD[alerta.severidad]}`}
              >
                {ETIQUETA_SEVERIDAD[alerta.severidad]}
              </span>
              <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-slate-900 dark:text-white">
                {alerta.titulo}
              </p>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600 dark:text-slate-300">
              {alerta.detalle}
            </p>
          </div>
        ))}
        {analisis.alertas.length > 6 && (
          <p className="px-1 text-[10px] text-slate-400">
            {analisis.alertas.length - 6} alerta
            {analisis.alertas.length - 6 !== 1 ? 's' : ''} más en el informe PDF.
          </p>
        )}
      </div>
    </div>
  )
}

const DatoRitmo = ({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: string
  nota: string
}) => (
  <div className="rounded-xl border border-white/60 bg-white/50 p-2 dark:border-white/[0.06] dark:bg-white/[0.035]">
    <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
      {etiqueta}
    </p>
    <p className="text-[14px] font-extrabold text-slate-900 dark:text-white">{valor}</p>
    <p className="truncate text-[9px] text-slate-400">{nota}</p>
  </div>
)
