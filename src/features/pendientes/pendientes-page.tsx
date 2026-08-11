import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BusFront,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Search,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { useAuthStore } from '@/store/auth-store'
import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'
import { MODULOS, type ModuloClave } from '@/constants/modulos'
import { useModulosConfig } from '@/hooks/use-modulos-config'
import { clavesVigentesEnSemana, modulosExigiblesPara } from '@/lib/cobertura-semanal'

type FlotaRow = Tables<'flota'>
type RevisionRow = Tables<'revisiones'>

/**
 * Trae TODAS las filas paginando de a 1000.
 *
 * PostgREST corta cada respuesta en 1000 filas aunque se pida un límite
 * mayor. Con una semana movida (flota grande más re-revisiones) el corte era
 * silencioso: los buses revisados a comienzos de semana quedaban fuera del
 * lote y aparecían como pendientes, mandando gente a repetirlos.
 */
const traerTodas = async <T,>(
  // `data` viaja como unknown: cada consulta pide sus propias columnas y el
  // tipo exacto lo fija quien llama
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> => {
  const PAGINA = 1000
  const filas: T[] = []
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await consulta(inicio, inicio + PAGINA - 1)
    if (error) throw error
    const lote = (data as T[] | null) ?? []
    filas.push(...lote)
    if (lote.length < PAGINA) return filas
  }
}

export const PendientesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { weekInfo } = useWeekFilter()
  const [terminalFilter, setTerminalFilter] = useState(user?.terminal ?? 'TODOS')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: flota, isLoading: flotaLoading } = useQuery({
    queryKey: ['flota-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flota')
        .select('*')
        .order('numero_interno', { ascending: true })
      if (error) throw error
      return (data ?? []) as FlotaRow[]
    },
  })

  const { data: revisiones, isLoading: revisionesLoading } = useQuery({
    queryKey: ['pendientes-revisiones', weekInfo.startISO, weekInfo.endISO],
    queryFn: () =>
      traerTodas<RevisionRow>((desde, hasta) =>
        supabase
          .from('revisiones')
          .select(
            'id, bus_ppu, bus_interno, inspector_nombre, terminal_detectado, estado_bus, created_at'
          )
          .gte('created_at', weekInfo.startISO)
          .lte('created_at', weekInfo.endISO)
          .order('created_at', { ascending: false })
          .range(desde, hasta)
      ),
    refetchInterval: 60_000,
  })

  // Alcance de la SEMANA seleccionada, no de hoy. Con la vigencia de hoy, un
  // módulo programado "sólo viernes" no aparecía pendiente en toda la semana
  // y el viernes volcaba la flota entera a pendiente de golpe; y al mirar
  // semanas pasadas se las juzgaba con la programación actual.
  const { porClave, cargando: modulosCargando } = useModulosConfig()
  const clavesActivas = useMemo(
    () => clavesVigentesEnSemana(porClave, weekInfo.startISO),
    [porClave, weekInfo.startISO]
  )

  const modulosMedibles = useMemo(
    () =>
      MODULOS.filter((modulo) => modulo.tabla !== null && clavesActivas.has(modulo.clave)),
    [clavesActivas]
  )

  /**
   * Buses que ya tienen dato de cada módulo activo dentro de la semana.
   *
   * "Pendiente" no significa lo mismo todas las semanas: si el supervisor dejó
   * activo sólo +15, el bus con una inspección completa de la semana pasada
   * pero sin la prueba de +15 sigue pendiente, y contarlo como hecho mandaba a
   * la calle a buscar buses equivocados. Por eso se pregunta por la tabla de
   * cada módulo vigente y no sólo por la existencia de una revisión.
   */
  const { data: cobertura, isLoading: coberturaLoading } = useQuery({
    queryKey: [
      'pendientes-cobertura',
      weekInfo.startISO,
      weekInfo.endISO,
      modulosMedibles.map((modulo) => modulo.clave).sort().join(','),
    ],
    enabled: modulosMedibles.length > 0,
    // El canal realtime invalida esta consulta con cada revisión nueva; el
    // intervalo queda de red de seguridad sin re-descargar todo cada 15 s
    refetchInterval: 60_000,
    queryFn: async () => {
      const porModulo = new Map<ModuloClave, Set<string>>()
      await Promise.all(
        modulosMedibles.map(async (modulo) => {
          try {
            const filas = await traerTodas<{ bus_ppu: string }>((desde, hasta) =>
              supabase
                .from(modulo.tabla as 'tags')
                .select('bus_ppu')
                .gte('created_at', weekInfo.startISO)
                .lte('created_at', weekInfo.endISO)
                .range(desde, hasta)
            )
            porModulo.set(modulo.clave, new Set(filas.map((fila) => fila.bus_ppu)))
          } catch (error) {
            // Tabla sin crear todavía: se informa y ese módulo no se exige,
            // en vez de marcar la flota entera como pendiente
            console.warn(`No se pudo leer ${modulo.tabla}`, error)
          }
        })
      )
      // Si NINGÚN módulo se pudo medir (RLS, tablas sin crear), un mapa vacío
      // marcaba la flota entera como "completada": cero faltantes para todos.
      // Devolver null hace caer al criterio clásico (¿tiene revisión?).
      return porModulo.size > 0 ? porModulo : null
    },
  })

  const buses = useMemo(() => {
    if (!flota) return []
    const latestByBus = new Map<string, RevisionRow>()
    revisiones?.forEach((revision) => {
      if (!latestByBus.has(revision.bus_ppu)) {
        latestByBus.set(revision.bus_ppu, revision)
      }
    })

    return flota.map((bus) => {
      const lastRevision = latestByBus.get(bus.ppu) ?? null

      // Un bus en panne no puede arrancar, así que los módulos que exigen el
      // bus operativo no se le pueden hacer. Contarlos como pendientes lo
      // dejaba en la lista indefinidamente, mandando a alguien a intentar una
      // prueba imposible semana tras semana.
      const enPanne = lastRevision?.estado_bus === 'EN_PANNE'

      // Módulos que a este bus todavía le faltan esta semana. La regla de
      // exigibilidad (tabla + vigencia + aplica al bus + panne) es la MISMA
      // que usa el aviso de "bus ya revisado": vive en cobertura-semanal.ts.
      const faltantes = modulosExigiblesPara(clavesActivas, bus, { enPanne }).filter(
        (modulo) => {
          const cubiertos = cobertura?.get(modulo.clave)
          // Sin datos del módulo (tabla ausente o consulta aún en vuelo) no
          // se inventa un pendiente: se cae al criterio de siempre
          if (!cubiertos) return false
          return !cubiertos.has(bus.ppu)
        }
      )

      // Los que quedan fuera por estar el bus en panne, para poder decirlo
      const omitidosPorPanne = enPanne
        ? modulosMedibles.filter((modulo) => modulo.requiereBusOperativo)
        : []

      // Con módulos medibles manda el detalle; sin ellos, la regla de antes
      const pending =
        modulosMedibles.length > 0 && cobertura ? faltantes.length > 0 : !lastRevision

      return {
        bus,
        lastRevision,
        pending,
        faltantes,
        enPanne,
        omitidosPorPanne,
        lastInspectionAt: lastRevision ? dayjs(lastRevision.created_at) : null,
      }
    })
  }, [flota, revisiones, modulosMedibles, cobertura])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toUpperCase()
    return buses
      .filter((item) => {
        if (terminalFilter !== 'TODOS' && item.bus.terminal !== terminalFilter) {
          return false
        }
        if (!query) return true
        return (
          item.bus.ppu.toUpperCase().includes(query) ||
          item.bus.numero_interno.toUpperCase().includes(query)
        )
      })
      .sort((a, b) => {
        // Primero lo que falta por hacer; dentro de cada grupo, por PPU:
        // es el dato que el inspector lee en el parabrisas.
        if (a.pending && !b.pending) return -1
        if (!a.pending && b.pending) return 1
        return a.bus.ppu.localeCompare(b.bus.ppu, 'es', {
          numeric: true,
          sensitivity: 'base',
        })
      })
  }, [buses, terminalFilter, searchQuery])

  const pendingCount = filtered.filter((item) => item.pending).length
  const total = filtered.length
  const completedCount = total - pendingCount
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0

  const handleStartRevision = (bus: FlotaRow) => {
    navigate(`/app/formulario?ppu=${encodeURIComponent(bus.ppu)}`)
  }

  const handleDownloadPDF = async () => {
    // La hoja se imprime con el alcance del TERMINAL, ignorando el buscador:
    // con "ZJ" escrito en la caja, el PDF salía con 2 pendientes y un avance
    // falso, y en terreno se daba la flota por casi lista
    const busesDelAlcance = buses.filter(
      (item) => terminalFilter === 'TODOS' || item.bus.terminal === terminalFilter
    )
    const pendientes = busesDelAlcance.filter((item) => item.pending)

    if (pendientes.length === 0) {
      alert('No hay buses pendientes para exportar')
      return
    }

    // jsPDF pesa ~620 kB con sus dependencias: se trae al pulsar
    const { generarHojaPendientes } = await import('@/features/pendientes/pendientes-pdf')
    generarHojaPendientes({
      buses: pendientes.map((item) => ({
        ppu: item.bus.ppu,
        interno: item.bus.numero_interno,
        terminal: item.bus.terminal,
      })),
      semana: weekInfo.weekNumber,
      rangoSemana: weekInfo.label,
      terminal:
        terminalFilter === 'TODOS'
          ? 'Todos los terminales'
          : `Terminal ${terminalFilter}`,
      totalFlota: busesDelAlcance.length,
      revisados: busesDelAlcance.length - pendientes.length,
      alcance: modulosMedibles.map((modulo) => modulo.nombre),
    })
  }

  const loading = flotaLoading || revisionesLoading || modulosCargando || coberturaLoading

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-brand-500">
              Control diario
            </p>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">
              Buses pendientes
            </h1>
            <p className="text-sm text-slate-500">
              Revisa cuáles buses aún no tienen inspección registrada esta semana.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <WeekSelector />
            <Button
              onClick={() => void handleDownloadPDF()}
              disabled={pendingCount === 0}
              className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
            >
              <Download className="h-4 w-4" />
              Descargar PDF Pendientes
            </Button>
          </div>
        </div>
        {/* Alcance vigente. Sin esto, "quedan 180 pendientes" no se puede
            interpretar: no es lo mismo que falte el check completo a que
            falte sólo la prueba de +15. */}
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--app-radius-sm)] border border-brand-200/60 bg-brand-50/60 px-3 py-2.5 dark:border-brand-900/40 dark:bg-brand-950/20">
          <span className="text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
            Se está revisando
          </span>
          {modulosMedibles.length === 0 ? (
            <span className="text-[12px] text-slate-500 dark:text-slate-400">
              Ningún módulo activo · se cuenta como pendiente el bus sin ninguna
              inspección de la semana
            </span>
          ) : (
            <>
              {modulosMedibles.map((modulo) => {
                const Icono = modulo.icono
                return (
                  <span
                    key={modulo.clave}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11.5px] font-bold text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-200"
                  >
                    <Icono className="h-3 w-3 text-brand-500" />
                    {modulo.nombre}
                  </span>
                )
              })}
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                · un bus queda pendiente mientras le falte alguno
              </span>
            </>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[240px,1fr]">
          <div>
            <Select value={terminalFilter} onValueChange={setTerminalFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar terminal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los terminales</SelectItem>
                <SelectItem value="El Roble">El Roble</SelectItem>
                <SelectItem value="La Reina">La Reina</SelectItem>
                <SelectItem value="María Angélica">María Angélica</SelectItem>
                <SelectItem value="Los Agricultores">Los Agricultores</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por PPU o Nº interno"
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Pendientes"
          value={pendingCount}
          description={
            modulosMedibles.length > 0
              ? `Les falta algún módulo activo`
              : 'Sin revisión esta semana'
          }
          icon={AlertTriangle}
          variant={pendingCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Completados"
          value={completedCount}
          description={
            modulosMedibles.length > 0
              ? 'Con todos los módulos activos'
              : 'Revisados esta semana'
          }
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Avance semanal"
          value={`${progress}%`}
          description={`${completedCount} de ${total} buses`}
          icon={Compass}
          variant={progress >= 80 ? 'success' : progress >= 50 ? 'info' : 'warning'}
        />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-900">
          <div>
            <h2 className="text-lg font-semibold">Listado de buses</h2>
            <p className="text-sm text-slate-500">
              {pendingCount} pendientes · {completedCount} completados
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {loading && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              Cargando flota...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No encontramos buses con esos filtros.
            </div>
          )}
          {!loading &&
            filtered.map(({ bus, lastRevision, pending, faltantes, omitidosPorPanne }) => (
              <div
                key={bus.id}
                className="flex flex-col gap-4 border-t border-transparent px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/30 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <BusFront className="h-5 w-5 text-brand-500" />
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {bus.ppu} · #{bus.numero_interno}
                      </p>
                      <p className="text-xs text-slate-500">
                        Terminal {bus.terminal}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {lastRevision ? (
                      <>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Revisado {lastRevision.inspector_nombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {dayjs(lastRevision.created_at).format('DD MMM HH:mm')}
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        Sin inspección esta semana
                      </span>
                    )}
                  </div>

                  {/* Qué le falta exactamente. Un "pendiente" a secas obliga a
                      abrir el bus para descubrir que sólo faltaba un módulo. */}
                  {faltantes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        Falta:
                      </span>
                      {faltantes.map((modulo) => {
                        const Icono = modulo.icono
                        return (
                          <span
                            key={modulo.clave}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          >
                            <Icono className="h-2.5 w-2.5" />
                            {modulo.nombre}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {omitidosPorPanne.length > 0 && (
                    <p className="pt-0.5 text-[11px] text-slate-400">
                      No aplica con el bus en panne:{' '}
                      {omitidosPorPanne.map((modulo) => modulo.nombre).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <Badge variant={pending ? 'warning' : 'success'}>
                    {pending ? 'Pendiente' : 'Completado'}
                  </Badge>
                  {pending ? (
                    <Button size="sm" className="rounded-xl" onClick={() => handleStartRevision(bus)}>
                      Iniciar revisión
                    </Button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ult. estado: {lastRevision?.estado_bus ?? '—'}
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  )
}
