import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Circle,
  CircleMarker,
  LayerGroup,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip as LeafletTooltip,
  useMapEvents,
} from 'react-leaflet'
import { divIcon, type Map as LeafletMap } from 'leaflet'
import {
  Bus,
  Crosshair,
  Layers,
  Locate,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Users2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { TERMINAL_GEOFENCES, type TerminalSlug } from '@/constants/geofences'
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

/** Minutos de gracia para seguir mostrando a alguien en la tira inferior */
const MINUTOS_RECIENTE = 60

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
        <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;border:2.5px solid rgba(255,255,255,.96);box-shadow:0 6px 16px rgba(15,23,42,.42);${
          enVivo ? '' : 'filter:grayscale(.7);opacity:.62;'
        }">${escapeHtml(iniciales)}</div>
        <span class="${enVivo ? 'marker-live-dot' : ''}" style="position:absolute;bottom:0;right:-1px;width:11px;height:11px;border-radius:50%;background:${
          enVivo ? '#22c55e' : '#94a3b8'
        };border:2px solid #fff;"></span>
      </div>
      <span style="background:rgba(15,23,42,.9);color:#fff;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,.35);">${escapeHtml(
        nombre
      )}</span>
    </div>`,
    iconSize: [130, 56],
    iconAnchor: [65, 19],
  })

  cacheInspector.set(clave, icono)
  return icono
}

const iconoBus = (enPanne: boolean) =>
  divIcon({
    className: '',
    html: `<div class="marker-bus" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:10px;background:${
      enPanne
        ? 'linear-gradient(135deg,#fb923c,#ea580c)'
        : 'linear-gradient(135deg,#34d399,#059669)'
    };border:2px solid rgba(255,255,255,.96);box-shadow:0 4px 12px rgba(15,23,42,.42);font-size:14px;cursor:pointer;">🚌</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })

const BUS_ICONS = { operativo: iconoBus(false), panne: iconoBus(true) }

/* ------------------------------------------------------------------ Utils */

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

const primerNombre = (nombre: string) => nombre.split(' ').filter(Boolean)[0] ?? nombre

/* ------------------------------------------------------------------ Props */

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

/** Registra la posición de la cámara para no perderla al entrar y salir de
 *  pantalla completa, que obliga a remontar el mapa. */
const SeguidorDeVista = ({
  onCambio,
}: {
  onCambio: (centro: [number, number], zoom: number) => void
}) => {
  const mapa = useMapEvents({
    moveend: () => {
      const centro = mapa.getCenter()
      onCambio([centro.lat, centro.lng], mapa.getZoom())
    },
  })
  return null
}

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
  const vistaRef = useRef<{ centro: [number, number]; zoom: number }>({
    centro: VISTA_GENERAL,
    zoom: ZOOM_GENERAL,
  })

  const [capa, setCapa] = useState<CapaId>(capaInicial)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [filtrosVisibles, setFiltrosVisibles] = useState(false)
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

  /**
   * Tira inferior: quien está en vivo ahora o dio señal en la última hora.
   * Los que llevan más tiempo desconectados no aportan a un panel de control
   * en directo y sólo alargarían la lista.
   */
  const inspectoresRecientes = useMemo(
    () =>
      inspectores
        .filter(
          (inspector) =>
            dayjs().diff(dayjs(inspector.last_heartbeat), 'minute') <= MINUTOS_RECIENTE
        )
        .sort((a, b) => {
          const vivoA = estaEnVivo(a.last_heartbeat) ? 1 : 0
          const vivoB = estaEnVivo(b.last_heartbeat) ? 1 : 0
          if (vivoA !== vivoB) return vivoB - vivoA
          return (
            new Date(b.last_heartbeat).valueOf() - new Date(a.last_heartbeat).valueOf()
          )
        }),
    // `tick` no se usa dentro pero es lo que refresca el paso del tiempo
    [inspectores, estaEnVivo, tick] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const enVivoCount = useMemo(
    () => inspectores.filter((i) => estaEnVivo(i.last_heartbeat)).length,
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

  const volarA = useCallback((lat: number, lon: number, zoom = 17) => {
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
      (posicion) => volarA(posicion.coords.latitude, posicion.coords.longitude, 17),
      (error) => console.warn('No se pudo ubicar el dispositivo', error),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [volarA])

  // Leaflet mide el contenedor al montarse; tras cambiar de tamaño hay que
  // avisarle o el mapa queda dibujado con las dimensiones antiguas.
  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.invalidateSize(), 240)
    return () => window.clearTimeout(id)
  }, [pantallaCompleta])

  // Salir de pantalla completa con Escape y bloquear el scroll de fondo
  useEffect(() => {
    if (!pantallaCompleta) return
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setPantallaCompleta(false)
    }
    window.addEventListener('keydown', alPulsar)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = ''
    }
  }, [pantallaCompleta])

  const alternarFiltro = (clave: keyof Filtros) =>
    setFiltros((prev) => ({ ...prev, [clave]: !prev[clave] }))

  const mapa = (
    <div
      className={cn(
        'relative overflow-hidden bg-slate-200/40 dark:bg-slate-900/40',
        pantallaCompleta
          ? 'h-[100dvh] w-screen'
          : 'h-[58vh] min-h-[22rem] w-full rounded-[var(--app-radius)] border border-white/60 dark:border-white/[0.07] lg:h-[34rem]'
      )}
    >
      <MapContainer
        center={vistaRef.current.centro}
        zoom={vistaRef.current.zoom}
        scrollWheelZoom
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        ref={mapRef}
      >
        <TileLayer
          key={capas[capa].id}
          url={capas[capa].url}
          attribution={capas[capa].attribution}
        />
        <SeguidorDeVista
          onCambio={(centro, zoom) => {
            vistaRef.current = { centro, zoom }
          }}
        />

        {filtros.geocercas && (
          <LayerGroup>
            {TERMINAL_GEOFENCES.map((cerca) => (
              <Circle
                key={cerca.name}
                center={[cerca.lat, cerca.lon]}
                radius={cerca.radius}
                pathOptions={{
                  color: '#38bdf8',
                  fillColor: '#38bdf8',
                  fillOpacity: 0.06,
                  weight: 1.5,
                  dashArray: '6 5',
                }}
              >
                <Popup>
                  <p className="text-sm font-semibold">{cerca.name}</p>
                  <p className="text-xs text-slate-500">Geocerca de {cerca.radius} m</p>
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
                <LayerGroup key={`inspector-${inspector.usuario_rut}`}>
                  {/* Halo de precisión GPS: da contexto al punto azul */}
                  {enVivo && inspector.accuracy ? (
                    <Circle
                      center={[inspector.lat, inspector.lon]}
                      radius={Math.min(inspector.accuracy, 120)}
                      pathOptions={{
                        color: esPropio ? '#22c55e' : '#0284c7',
                        fillColor: esPropio ? '#22c55e' : '#0284c7',
                        fillOpacity: 0.1,
                        weight: 1,
                      }}
                    />
                  ) : null}
                  <Marker
                    position={[inspector.lat, inspector.lon]}
                    icon={iconoInspector(
                      iniciales(inspector.nombre),
                      primerNombre(inspector.nombre),
                      esPropio ? '#16a34a' : '#0284c7',
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
                        {inspector.terminal} · GPS ±
                        {Math.round(inspector.accuracy ?? 0)} m
                        <br />
                        Última señal {dayjs(inspector.last_heartbeat).format('HH:mm:ss')}{' '}
                        hrs
                      </p>
                    </Popup>
                  </Marker>
                </LayerGroup>
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

      {/* ---------------------------------------------------- Esquina superior */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-start justify-between gap-1.5 p-2',
          pantallaCompleta && 'safe-top'
        )}
      >
        {/* Contadores en vivo */}
        <div className="glass-panel-strong pointer-events-auto flex shrink-0 items-center gap-2 rounded-[13px] px-2.5 py-1.5">
          <Contador
            icono={<Users2 className="h-3 w-3" />}
            valor={enVivoCount}
            tono="text-emerald-600 dark:text-emerald-400"
            titulo={`${enVivoCount} inspectores en vivo`}
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
        <div
          className={cn(
            'glass-panel-strong absolute right-2 z-[520] w-[13.5rem] rounded-[14px] p-2',
            pantallaCompleta ? 'top-[calc(env(safe-area-inset-top)+3.4rem)]' : 'top-[3.4rem]'
          )}
        >
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
      <div
        className={cn(
          'absolute right-2 z-[500] flex flex-col gap-1.5',
          pantallaCompleta
            ? 'bottom-[max(3.5rem,calc(3rem+env(safe-area-inset-bottom)))]'
            : 'bottom-12'
        )}
      >
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

      {/* ---------------------------------------------------- Barra inferior */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-2',
          pantallaCompleta && 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
        )}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
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
              panelAbierto
                ? 'text-brand-600 dark:text-brand-300'
                : 'text-slate-700 dark:text-slate-200'
            )}
          >
            {panelAbierto ? 'Ocultar' : 'Tickets'}
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
            Tickets geolocalizados ({tickets.length})
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

        <div className="space-y-1">
          {tickets.length === 0 && (
            <p className="rounded-[12px] border border-dashed border-slate-300/70 px-2.5 py-5 text-center text-[11px] text-slate-400 dark:border-slate-700">
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

  return (
    <div className="space-y-2">
      {/*
        A pantalla completa el mapa se monta en <body> mediante un portal.
        No es un capricho: la tarjeta que lo contiene aplica `backdrop-filter`,
        y eso convierte a la tarjeta en el bloque contenedor de cualquier hijo
        con `position: fixed`. El mapa se estiraba a lo ancho de la tarjeta y
        quedaba reducido a una franja en lugar de ocupar la pantalla.
      */}
      {pantallaCompleta
        ? createPortal(
            <div className="fixed inset-0 z-[9999] bg-slate-950">{mapa}</div>,
            document.body
          )
        : mapa}

      {/* -------------------------------- Tira de inspectores bajo el mapa */}
      <div className="rounded-[var(--app-radius)] border border-white/60 bg-white/40 p-2 dark:border-white/[0.07] dark:bg-white/[0.035]">
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
            Inspectores en terreno
          </p>
          <p className="text-[9.5px] font-bold text-slate-400">
            {enVivoCount} en vivo · última hora
          </p>
        </div>

        {inspectoresRecientes.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-slate-400">
            Nadie ha dado señal en la última hora.
          </p>
        ) : (
          <div className="snap-row pb-0.5">
            {inspectoresRecientes.map((inspector) => {
              const enVivo = estaEnVivo(inspector.last_heartbeat)
              const esPropio = rutPropio === inspector.usuario_rut
              return (
                <button
                  key={inspector.usuario_rut}
                  type="button"
                  onClick={() => volarA(inspector.lat, inspector.lon, 17)}
                  title={`${inspector.nombre} · ${inspector.terminal} · pulso ${formatearPulso(
                    inspector.last_heartbeat
                  )}`}
                  className="press-feedback flex w-[4.6rem] flex-col items-center gap-1 rounded-[13px] px-1 py-1.5 hover:bg-white/60 dark:hover:bg-white/[0.07]"
                >
                  <span className="relative">
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white shadow-md dark:border-slate-800',
                        esPropio ? 'bg-emerald-600' : 'bg-sky-600',
                        !enVivo && 'opacity-50 grayscale'
                      )}
                    >
                      {iniciales(inspector.nombre)}
                    </span>
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-800',
                        enVivo ? 'marker-live-dot bg-emerald-500' : 'bg-slate-400'
                      )}
                    />
                  </span>
                  <span className="w-full truncate text-center text-[9.5px] font-bold leading-tight text-slate-700 dark:text-slate-200">
                    {nombreCorto(inspector.nombre)}
                  </span>
                  <span
                    className={cn(
                      'text-[8.5px] font-semibold leading-none',
                      enVivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    )}
                  >
                    {enVivo ? 'en vivo' : formatearPulso(inspector.last_heartbeat)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
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
}: {
  icono: React.ReactNode
  valor: number
  tono: string
  titulo: string
}) => (
  <span className={cn('flex items-center gap-1', tono)} title={titulo}>
    <span className="shrink-0">{icono}</span>
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
