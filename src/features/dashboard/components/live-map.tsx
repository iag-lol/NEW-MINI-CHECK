import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  CircleMarker,
  LayerGroup,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip as LeafletTooltip,
} from 'react-leaflet'
import { divIcon, type Map as LeafletMap } from 'leaflet'
import {
  Bus,
  Crosshair,
  Layers,
  Locate,
  Maximize2,
  Minimize2,
  Search,
  ShieldAlert,
  Users2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { TERMINAL_GEOFENCES, type TerminalSlug } from '@/constants/geofences'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>
type Ticket = Tables<'tickets'>
type InspectorActivo = Tables<'usuarios_activos'>

export interface TicketMarker {
  ticket: Ticket
  revision: Revision
}

const VISTA_GENERAL: [number, number] = [-33.46, -70.65]
const ZOOM_GENERAL = 11
const ZOOM_TERMINAL = 16

const escapeHtml = (value: string) => value.replace(/[<>&"']/g, '')

/* -------------------------------------------------------------------------
   Iconos
   `divIcon` devuelve una instancia nueva en cada llamada y Leaflet reemplaza
   el DOM del marcador cuando cambia la referencia. Con pulsos GPS cada 10 s
   eso hacía parpadear a los inspectores, así que se cachean por apariencia.
   ------------------------------------------------------------------------- */

const cacheInspector = new Map<string, ReturnType<typeof divIcon>>()

const iconoInspector = (
  iniciales: string,
  nombre: string,
  color: string,
  enVivo: boolean
) => {
  const clave = `${iniciales}|${nombre}|${color}|${enVivo}`
  const guardado = cacheInspector.get(clave)
  if (guardado) return guardado

  const icono = divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="position:relative;">
        <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:700;border:2px solid rgba(255,255,255,.95);box-shadow:0 5px 12px rgba(15,23,42,.35);${
          enVivo ? '' : 'filter:grayscale(.65);opacity:.7;'
        }">${escapeHtml(iniciales)}</div>
        <span class="${enVivo ? 'marker-live-dot' : ''}" style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${
          enVivo ? '#22c55e' : '#94a3b8'
        };border:2px solid #fff;"></span>
      </div>
      <span style="background:rgba(15,23,42,.88);color:#fff;font-size:9px;font-weight:600;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,.3);">${escapeHtml(
        nombre
      )}${enVivo ? '' : ' · inactivo'}</span>
    </div>`,
    iconSize: [120, 52],
    iconAnchor: [60, 18],
  })

  cacheInspector.set(clave, icono)
  return icono
}

const iconoBus = (enPanne: boolean) =>
  divIcon({
    className: '',
    html: `<div class="marker-bus" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:11px;background:${
      enPanne
        ? 'linear-gradient(135deg,#f97316,#ea580c)'
        : 'linear-gradient(135deg,#22c55e,#16a34a)'
    };border:2px solid rgba(255,255,255,.95);box-shadow:0 5px 14px rgba(15,23,42,.4);font-size:15px;cursor:pointer;">🚌</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

const BUS_ICONS = { operativo: iconoBus(false), panne: iconoBus(true) }

/* ------------------------------------------------------------------------- */

export interface LiveMapProps {
  inspectores: InspectorActivo[]
  buses: Revision[]
  tickets: TicketMarker[]
  /** Segundos desde el último pulso para seguir considerando a alguien en vivo */
  umbralEnVivoSeg: number
  rutPropio?: string
  onSeleccionarBus: (ppu: string) => void
  /** Fuerza el recálculo periódico de "en vivo" */
  tick: number
  capaInicial?: 'street' | 'satellite'
  tokenMapbox?: string
}

type CapaId = 'street' | 'satellite'

interface Filtros {
  buses: boolean
  inspectores: boolean
  tickets: boolean
  geocercas: boolean
}

const formatearPulso = (ultimoPulso: string) => {
  const segundos = dayjs().diff(dayjs(ultimoPulso), 'second')
  if (segundos < 60) return `hace ${segundos} s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  return dayjs(ultimoPulso).fromNow()
}

const iniciales = (nombre: string) =>
  nombre
    .split(' ')
    .filter(Boolean)
    .map((palabra) => palabra[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('es')

const nombreCorto = (nombre: string) =>
  nombre.split(' ').filter(Boolean).slice(0, 2).join(' ')

export const LiveMap = ({
  inspectores,
  buses,
  tickets,
  umbralEnVivoSeg,
  rutPropio,
  onSeleccionarBus,
  tick,
  capaInicial = 'satellite',
  tokenMapbox,
}: LiveMapProps) => {
  const mapRef = useRef<LeafletMap | null>(null)
  const contenedorRef = useRef<HTMLDivElement | null>(null)

  const [capa, setCapa] = useState<CapaId>(capaInicial)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [filtrosVisibles, setFiltrosVisibles] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({
    buses: true,
    inspectores: true,
    tickets: true,
    geocercas: true,
  })

  const capas = useMemo(
    () => ({
      street: {
        id: 'street' as const,
        label: 'Calles',
        url: tokenMapbox
          ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${tokenMapbox}`
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: tokenMapbox
          ? '© Mapbox · © OpenStreetMap'
          : '© OpenStreetMap contributors',
      },
      satellite: {
        id: 'satellite' as const,
        label: 'Satélite',
        url: tokenMapbox
          ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${tokenMapbox}`
          : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: tokenMapbox
          ? '© Mapbox · © OpenStreetMap'
          : '© Esri · Earthstar Geographics',
      },
    }),
    [tokenMapbox]
  )

  const estaEnVivo = useCallback(
    (ultimoPulso: string) =>
      dayjs().diff(dayjs(ultimoPulso), 'second') <= umbralEnVivoSeg,
    [umbralEnVivoSeg]
  )

  const enVivoCount = useMemo(
    () => inspectores.filter((i) => estaEnVivo(i.last_heartbeat)).length,
    // `tick` no se usa dentro, pero es lo que obliga a reevaluar el paso del
    // tiempo: sin él el contador se congelaría hasta el próximo pulso.
    [inspectores, estaEnVivo, tick] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const ticketsAbiertos = useMemo(
    () => tickets.filter(({ ticket }) => ticket.estado !== 'RESUELTO').length,
    [tickets]
  )

  const busesEnPanne = useMemo(
    () => buses.filter((bus) => bus.estado_bus === 'EN_PANNE').length,
    [buses]
  )

  const resultados = useMemo(() => {
    const termino = busqueda.trim().toLocaleUpperCase('es')
    if (termino.length < 2) return []

    const porBus = buses
      .filter(
        (bus) =>
          bus.bus_ppu.toLocaleUpperCase('es').includes(termino) ||
          (bus.bus_interno ?? '').toLocaleUpperCase('es').includes(termino)
      )
      .slice(0, 4)
      .map((bus) => ({
        tipo: 'bus' as const,
        clave: `bus-${bus.id}`,
        titulo: bus.bus_ppu,
        detalle: `N° ${bus.bus_interno} · ${bus.terminal_reportado}`,
        lat: bus.lat,
        lon: bus.lon,
      }))

    const porInspector = inspectores
      .filter((inspector) =>
        inspector.nombre.toLocaleUpperCase('es').includes(termino)
      )
      .slice(0, 4)
      .map((inspector) => ({
        tipo: 'inspector' as const,
        clave: `insp-${inspector.usuario_rut}`,
        titulo: nombreCorto(inspector.nombre),
        detalle: `${inspector.terminal} · pulso ${formatearPulso(inspector.last_heartbeat)}`,
        lat: inspector.lat,
        lon: inspector.lon,
      }))

    return [...porInspector, ...porBus]
  }, [busqueda, buses, inspectores])

  const volarA = useCallback((lat: number, lon: number, zoom = ZOOM_TERMINAL) => {
    mapRef.current?.flyTo([lat, lon], zoom, { duration: 1.1 })
  }, [])

  const irATerminal = useCallback(
    (terminal: TerminalSlug) => {
      const cerca = TERMINAL_GEOFENCES.find((item) => item.name === terminal)
      if (cerca) volarA(cerca.lat, cerca.lon, 15)
    },
    [volarA]
  )

  const vistaGeneral = useCallback(() => {
    mapRef.current?.flyTo(VISTA_GENERAL, ZOOM_GENERAL, { duration: 0.9 })
  }, [])

  const ubicarme = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      (posicion) =>
        volarA(posicion.coords.latitude, posicion.coords.longitude, 17),
      (error) => console.warn('No se pudo ubicar el dispositivo', error),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [volarA])

  // Leaflet mide el contenedor al montarse: al cambiar de tamaño hay que
  // avisarle o el mapa queda dibujado con las dimensiones antiguas.
  useEffect(() => {
    const mapa = mapRef.current
    if (!mapa) return
    const id = window.setTimeout(() => mapa.invalidateSize(), 260)
    return () => window.clearTimeout(id)
  }, [pantallaCompleta])

  // Salir de pantalla completa con Escape
  useEffect(() => {
    if (!pantallaCompleta) return
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setPantallaCompleta(false)
    }
    window.addEventListener('keydown', alPulsar)
    // Evita que la página de fondo haga scroll bajo el mapa
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = ''
    }
  }, [pantallaCompleta])

  const alternarFiltro = (clave: keyof Filtros) =>
    setFiltros((prev) => ({ ...prev, [clave]: !prev[clave] }))

  return (
    <div
      ref={contenedorRef}
      className={cn(
        'relative overflow-hidden rounded-[var(--app-radius)] border border-white/60 bg-slate-200/40 dark:border-white/[0.07] dark:bg-slate-900/40',
        pantallaCompleta
          ? 'fixed inset-0 z-[60] rounded-none border-0'
          : 'h-[58vh] min-h-[22rem] w-full lg:h-[34rem]'
      )}
    >
      <MapContainer
        center={VISTA_GENERAL}
        zoom={ZOOM_GENERAL}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
        ref={mapRef}
      >
        <TileLayer
          key={capas[capa].id}
          url={capas[capa].url}
          attribution={capas[capa].attribution}
        />

        {filtros.geocercas && (
          <LayerGroup>
            {TERMINAL_GEOFENCES.map((cerca) => (
              <Circle
                key={cerca.name}
                center={[cerca.lat, cerca.lon]}
                radius={cerca.radius}
                pathOptions={{ color: '#0ea5e9', fillOpacity: 0.07, weight: 1.5 }}
              >
                <Popup>
                  <p className="text-sm font-semibold">{cerca.name}</p>
                  <p className="text-xs text-slate-500">
                    Geocerca de {cerca.radius} m
                  </p>
                </Popup>
              </Circle>
            ))}
          </LayerGroup>
        )}

        {filtros.buses && (
          <LayerGroup>
            {buses.map((revision) => (
              <Marker
                key={`bus-${revision.id}`}
                position={[revision.lat, revision.lon]}
                icon={
                  revision.estado_bus === 'EN_PANNE'
                    ? BUS_ICONS.panne
                    : BUS_ICONS.operativo
                }
                eventHandlers={{ click: () => onSeleccionarBus(revision.bus_ppu) }}
              >
                <LeafletTooltip
                  direction="top"
                  offset={[0, -14]}
                  opacity={1}
                  className="bus-tooltip"
                >
                  <span className="font-bold">{revision.bus_ppu}</span>
                  <span className="ml-1.5 opacity-75">
                    {revision.estado_bus === 'EN_PANNE' ? '· En panne' : '· Operativo'}
                  </span>
                </LeafletTooltip>
              </Marker>
            ))}
          </LayerGroup>
        )}

        {filtros.inspectores && (
          <LayerGroup>
            {inspectores.map((inspector) => {
              const esPropio = rutPropio === inspector.usuario_rut
              const enVivo = estaEnVivo(inspector.last_heartbeat)
              return (
                <Marker
                  key={`inspector-${inspector.usuario_rut}`}
                  position={[inspector.lat, inspector.lon]}
                  icon={iconoInspector(
                    iniciales(inspector.nombre),
                    nombreCorto(inspector.nombre),
                    esPropio ? '#22c55e' : '#0284c7',
                    enVivo
                  )}
                  zIndexOffset={enVivo ? 1000 : 0}
                >
                  <Popup>
                    <p className="text-sm font-semibold">{inspector.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {enVivo
                        ? `🟢 EN VIVO · pulso ${formatearPulso(inspector.last_heartbeat)}`
                        : `⚪ Inactivo · último pulso ${formatearPulso(inspector.last_heartbeat)}`}
                      <br />
                      {inspector.terminal} · GPS ±{Math.round(inspector.accuracy ?? 0)} m
                      <br />
                      Última señal{' '}
                      {dayjs(inspector.last_heartbeat).format('HH:mm:ss')} hrs
                    </p>
                  </Popup>
                </Marker>
              )
            })}
          </LayerGroup>
        )}

        {filtros.tickets && (
          <LayerGroup>
            {tickets.map(({ ticket, revision }) => (
              <CircleMarker
                key={`ticket-${ticket.id}`}
                center={[revision.lat, revision.lon]}
                radius={8}
                pathOptions={{
                  color:
                    ticket.estado === 'PENDIENTE'
                      ? '#ef4444'
                      : ticket.estado === 'EN_PROCESO'
                        ? '#facc15'
                        : '#14b8a6',
                  weight: 3,
                  opacity: 0.85,
                }}
              >
                <Popup>
                  <p className="text-sm font-semibold">{ticket.modulo}</p>
                  <p className="text-xs text-slate-500">
                    {ticket.descripcion}
                    <br />
                    {revision.bus_ppu} · Estado: {ticket.estado}
                  </p>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        )}
      </MapContainer>

      {/* --------------------------------------------------- Barra superior */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start gap-1.5 p-2',
          // A pantalla completa el mapa ocupa hasta el borde físico: hay que
          // apartar los controles de la isla dinámica y del notch.
          pantallaCompleta && 'safe-top'
        )}
      >
        <div className="pointer-events-auto flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="glass-panel-strong flex items-center gap-1.5 rounded-[13px] p-1 pl-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar bus o inspector..."
              aria-label="Buscar en el mapa"
              className="h-7 border-0 bg-transparent px-0 text-[12px] shadow-none focus-visible:ring-0"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-white/60 dark:hover:bg-white/10"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {resultados.length > 0 && (
            <div className="glass-panel-strong max-h-52 overflow-y-auto rounded-[13px] p-1">
              {resultados.map((resultado) => (
                <button
                  key={resultado.clave}
                  type="button"
                  onClick={() => {
                    volarA(resultado.lat, resultado.lon, 17)
                    setBusqueda('')
                  }}
                  className="press-feedback flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-white/60 dark:hover:bg-white/10"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-white',
                      resultado.tipo === 'bus' ? 'bg-emerald-500' : 'bg-sky-500'
                    )}
                  >
                    {resultado.tipo === 'bus' ? (
                      <Bus className="h-3 w-3" />
                    ) : (
                      <Users2 className="h-3 w-3" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-slate-900 dark:text-white">
                      {resultado.titulo}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {resultado.detalle}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col gap-1.5">
          <BotonMapa
            label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={() => setPantallaCompleta((prev) => !prev)}
            activo={pantallaCompleta}
          >
            {pantallaCompleta ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </BotonMapa>
          <BotonMapa
            label="Capas y filtros"
            onClick={() => setFiltrosVisibles((prev) => !prev)}
            activo={filtrosVisibles}
          >
            <Layers className="h-3.5 w-3.5" />
          </BotonMapa>
        </div>
      </div>

      {/* ------------------------------------------------- Panel de filtros */}
      {filtrosVisibles && (
        <div className="glass-panel-strong absolute right-2 top-[3.4rem] z-[500] w-[13.5rem] rounded-[14px] p-2">
          <p className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
            Vista base
          </p>
          <div className="mb-2 grid grid-cols-2 gap-1">
            {(Object.values(capas) as Array<(typeof capas)[CapaId]>).map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                onClick={() => setCapa(opcion.id)}
                className={cn(
                  'press-feedback rounded-[9px] px-2 py-1.5 text-[11px] font-bold',
                  capa === opcion.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-white/50 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
                )}
              >
                {opcion.label}
              </button>
            ))}
          </div>

          <p className="mb-1.5 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
            Mostrar en el mapa
          </p>
          <div className="space-y-0.5">
            <FilaFiltro
              label="Buses revisados"
              cantidad={buses.length}
              activo={filtros.buses}
              onToggle={() => alternarFiltro('buses')}
              color="bg-emerald-500"
            />
            <FilaFiltro
              label="Inspectores"
              cantidad={inspectores.length}
              activo={filtros.inspectores}
              onToggle={() => alternarFiltro('inspectores')}
              color="bg-sky-500"
            />
            <FilaFiltro
              label="Tickets"
              cantidad={tickets.length}
              activo={filtros.tickets}
              onToggle={() => alternarFiltro('tickets')}
              color="bg-red-500"
            />
            <FilaFiltro
              label="Geocercas"
              cantidad={TERMINAL_GEOFENCES.length}
              activo={filtros.geocercas}
              onToggle={() => alternarFiltro('geocercas')}
              color="bg-cyan-500"
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------- Controles de la derecha */}
      <div className="absolute bottom-16 right-2 z-[500] flex flex-col gap-1.5 sm:bottom-3">
        <BotonMapa label="Acercar" onClick={() => mapRef.current?.zoomIn()}>
          <ZoomIn className="h-3.5 w-3.5" />
        </BotonMapa>
        <BotonMapa label="Alejar" onClick={() => mapRef.current?.zoomOut()}>
          <ZoomOut className="h-3.5 w-3.5" />
        </BotonMapa>
        <BotonMapa label="Mi ubicación" onClick={ubicarme}>
          <Locate className="h-3.5 w-3.5" />
        </BotonMapa>
        <BotonMapa label="Ver toda la red" onClick={vistaGeneral}>
          <Crosshair className="h-3.5 w-3.5" />
        </BotonMapa>
      </div>

      {/* ------------------------------------------------ Barra inferior */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-2',
          pantallaCompleta && 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
        )}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          {/* Marcadores en vivo */}
          <div className="glass-panel-strong flex shrink-0 items-center gap-2 rounded-[13px] px-2.5 py-1.5">
            <Contador
              icono={<Users2 className="h-3 w-3" />}
              valor={enVivoCount}
              tono="text-emerald-600 dark:text-emerald-400"
              titulo={`${enVivoCount} inspectores en vivo`}
              pulso
            />
            <span className="h-4 w-px bg-slate-300/50 dark:bg-white/10" />
            <Contador
              icono={<Bus className="h-3 w-3" />}
              valor={buses.length}
              tono="text-slate-700 dark:text-slate-200"
              titulo={`${buses.length} buses revisados`}
            />
            {busesEnPanne > 0 && (
              <>
                <span className="h-4 w-px bg-slate-300/50 dark:bg-white/10" />
                <Contador
                  icono={<ShieldAlert className="h-3 w-3" />}
                  valor={busesEnPanne}
                  tono="text-orange-600 dark:text-orange-400"
                  titulo={`${busesEnPanne} buses en panne`}
                />
              </>
            )}
            {ticketsAbiertos > 0 && (
              <>
                <span className="h-4 w-px bg-slate-300/50 dark:bg-white/10" />
                <Contador
                  icono={<ShieldAlert className="h-3 w-3" />}
                  valor={ticketsAbiertos}
                  tono="text-red-600 dark:text-red-400"
                  titulo={`${ticketsAbiertos} tickets abiertos`}
                />
              </>
            )}
          </div>

          {/* Salto rápido a terminal */}
          <div className="snap-row min-w-0 flex-1">
            {TERMINAL_GEOFENCES.map((terminal) => (
              <button
                key={terminal.name}
                type="button"
                onClick={() => irATerminal(terminal.name)}
                className="glass-panel-strong press-feedback whitespace-nowrap rounded-[11px] px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200"
              >
                {terminal.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPanelAbierto((prev) => !prev)}
            aria-expanded={panelAbierto}
            className={cn(
              'glass-panel-strong press-feedback shrink-0 whitespace-nowrap rounded-[11px] px-2.5 py-1.5 text-[11px] font-bold',
              panelAbierto ? 'text-brand-600 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
            )}
          >
            {panelAbierto ? 'Ocultar lista' : 'Ver lista'}
          </button>
        </div>
      </div>

      {/* --------------------------------------------- Panel lateral de datos */}
      <div
        className={cn(
          'glass-panel-strong absolute bottom-0 right-0 top-0 z-[550] w-[min(20rem,86vw)] overflow-y-auto p-3 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]',
          panelAbierto ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-hidden={!panelAbierto}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[13px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
            En el mapa ahora
          </p>
          <button
            type="button"
            onClick={() => setPanelAbierto(false)}
            aria-label="Cerrar lista"
            className="rounded-full p-1 text-slate-400 hover:bg-white/60 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          Inspectores ({inspectores.length})
        </p>
        <div className="mb-3 space-y-1">
          {inspectores.length === 0 && (
            <p className="rounded-[12px] border border-dashed border-slate-300/70 px-2.5 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
              Sin inspectores dentro de terminales.
            </p>
          )}
          {inspectores.map((inspector) => {
            const enVivo = estaEnVivo(inspector.last_heartbeat)
            return (
              <button
                key={inspector.usuario_rut}
                type="button"
                onClick={() => volarA(inspector.lat, inspector.lon, 17)}
                className="press-feedback flex w-full items-center gap-2 rounded-[12px] border border-white/60 bg-white/40 p-2 text-left dark:border-white/[0.06] dark:bg-white/[0.035]"
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    enVivo
                      ? 'marker-live-dot bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-600'
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-bold text-slate-900 dark:text-white">
                    {inspector.nombre}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {inspector.terminal} · ±{Math.round(inspector.accuracy ?? 0)} m ·{' '}
                    {formatearPulso(inspector.last_heartbeat)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          Tickets geolocalizados ({tickets.length})
        </p>
        <div className="space-y-1">
          {tickets.length === 0 && (
            <p className="rounded-[12px] border border-dashed border-slate-300/70 px-2.5 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
              Sin tickets con coordenadas.
            </p>
          )}
          {tickets.map(({ ticket, revision }) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => volarA(revision.lat, revision.lon, 17)}
              className="press-feedback flex w-full items-start gap-2 rounded-[12px] border border-white/60 bg-white/40 p-2 text-left dark:border-white/[0.06] dark:bg-white/[0.035]"
            >
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  ticket.estado === 'PENDIENTE'
                    ? 'bg-red-500'
                    : ticket.estado === 'EN_PROCESO'
                      ? 'bg-amber-400'
                      : 'bg-teal-500'
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-bold text-slate-900 dark:text-white">
                  {ticket.modulo} · {revision.bus_ppu}
                </span>
                <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                  {ticket.estado} · {revision.terminal_detectado}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Piezas */

const BotonMapa = ({
  label,
  onClick,
  activo,
  children,
}: {
  label: string
  onClick: () => void
  activo?: boolean
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      'glass-panel-strong press-feedback flex h-8 w-8 items-center justify-center rounded-[11px]',
      activo ? 'text-brand-600 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'
    )}
  >
    {children}
  </button>
)

const Contador = ({
  icono,
  valor,
  tono,
  titulo,
  pulso,
}: {
  icono: React.ReactNode
  valor: number
  tono: string
  titulo: string
  pulso?: boolean
}) => (
  <span className={cn('flex items-center gap-1', tono)} title={titulo}>
    <span className={cn('shrink-0', pulso && valor > 0 && 'marker-live-dot rounded-full')}>
      {icono}
    </span>
    <span className="text-[12px] font-extrabold tabular-nums">{valor}</span>
  </span>
)

const FilaFiltro = ({
  label,
  cantidad,
  activo,
  onToggle,
  color,
}: {
  label: string
  cantidad: number
  activo: boolean
  onToggle: () => void
  color: string
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={activo}
    className={cn(
      'flex w-full items-center gap-2 rounded-[9px] px-1.5 py-1.5 text-left transition',
      activo ? 'bg-white/50 dark:bg-white/[0.07]' : 'opacity-45'
    )}
  >
    <span className={cn('h-2 w-2 shrink-0 rounded-full', color)} />
    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
      {label}
    </span>
    <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-500">
      {cantidad}
    </span>
  </button>
)
