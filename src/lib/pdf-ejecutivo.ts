import { jsPDF } from 'jspdf'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { MODULOS, type ModuloClave } from '@/constants/modulos'
import {
  desdeFila,
  describirProgramacion,
  moduloAplicaEn,
  programacionPorDefecto,
  type FilaModuloConfig,
  type ProgramacionModulo,
} from '@/lib/programacion'
import type { Tables } from '@/types/database'

/**
 * Informe ejecutivo semanal.
 *
 * Está pensado para imprimirse y repartirse en una reunión de gerencia: abre
 * con el veredicto y las decisiones que hay que tomar, y sólo después baja al
 * detalle que las respalda.
 *
 * Dos criterios lo gobiernan:
 *
 * 1. Un módulo apagado o fuera de su programación NO es un 0 % de cobertura.
 *    Es un "no correspondía", y mezclarlo con lo que sí se debía revisar y no
 *    se revisó convierte el informe en ruido. Por eso cada módulo declara su
 *    estado de configuración antes de mostrar su cifra.
 * 2. Todo porcentaje dice sobre qué se calcula. Un "92 %" sin denominador no
 *    se puede discutir en una reunión, y este documento existe para decidir.
 */

/* ------------------------------------------------------------------ Paleta */

const TINTA = [15, 23, 42] as const
const MARCA = [79, 70, 229] as const
const SUAVE = [100, 116, 139] as const
const LINEA = [214, 222, 234] as const
const FONDO = [246, 248, 252] as const
const VERDE = [22, 163, 74] as const
const AMBAR = [217, 119, 6] as const
const ROJO = [220, 38, 38] as const
const GRIS = [148, 163, 184] as const

type Color = readonly [number, number, number]

/** Verde / ámbar / rojo según el valor supere o no cada corte. */
const semaforo = (valor: number, bien: number, regular: number): Color =>
  valor >= bien ? VERDE : valor >= regular ? AMBAR : ROJO

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0)

const entero = (valor: number) => valor.toLocaleString('es-CL')

/* ------------------------------------------------------------------- Datos */

export interface Hallazgo {
  etiqueta: string
  cantidad: number
  /** Exige acción inmediata: sale también en el resumen de decisiones */
  critico?: boolean
}

export type EstadoModulo = 'siempre' | 'programado' | 'apagado'

export interface ResumenModulo {
  clave: ModuloClave
  nombre: string
  funcion: string
  estado: EstadoModulo
  regla: string
  /** Días del período en los que el módulo debía aparecer en el formulario */
  diasAplicables: number
  registros: number
  busesDistintos: number
  /** Registros sobre revisiones del período */
  cobertura: number
  hallazgos: Hallazgo[]
  totalHallazgos: number
}

export interface ResumenTerminal {
  terminal: string
  flota: number
  revisados: number
  avance: number
  operativos: number
  enPanne: number
  sinRevisar: number
}

export interface DatosEjecutivos {
  desde: string
  hasta: string
  etiquetaPeriodo: string
  diasPeriodo: number
  semanaIso: number

  totalFlota: number
  revisiones: number
  busesRevisados: number
  cumplimiento: number
  /** Mismo indicador en el período inmediatamente anterior, para la tendencia */
  cumplimientoPrevio: number | null
  revisionesPrevias: number

  operativos: number
  enPanne: number
  sinDato: number
  operatividad: number

  nuncaRevisados: number
  sinRevisarEnPeriodo: number

  ticketsAbiertos: number
  ticketsNuevos: number
  ticketsResueltos: number
  ticketsAltos: number
  ticketAntiguoDias: number | null

  inspectoresActivos: number
  porInspector: Array<{ nombre: string; revisiones: number; buses: number }>
  porDia: Array<{ etiqueta: string; revisiones: number }>

  terminales: ResumenTerminal[]
  modulos: ResumenModulo[]

  busesEnPanne: Array<{ ppu: string; interno: string; terminal: string; desde: string }>
  busesSinRevisar: Array<{
    ppu: string
    interno: string
    terminal: string
    ultima: string | null
    ultimaISO: string | null
  }>

  configDisponible: boolean
}

type RevisionRow = Tables<'revisiones'>
type FlotaRow = Tables<'flota'>
type TicketRow = Tables<'tickets'>

/** Fila mínima común a todas las tablas de módulo */
interface FilaModulo {
  bus_ppu: string
  created_at: string
}

/**
 * Hallazgos de cada módulo.
 *
 * Se declaran aquí y no en cada pantalla porque son la definición operativa de
 * "esto está mal": si el informe y el dashboard usaran criterios distintos, la
 * reunión se iría en discutir cuál de los dos miente.
 */
const calcularHallazgos = (clave: ModuloClave, filas: FilaModulo[]): Hallazgo[] => {
  const contar = <T>(rows: T[], predicado: (row: T) => boolean) =>
    rows.filter(predicado).length

  switch (clave) {
    case 'tag': {
      const rows = filas as unknown as Tables<'tags'>[]
      return [
        { etiqueta: 'Buses sin TAG instalado', cantidad: contar(rows, (r) => !r.tiene), critico: true },
        {
          etiqueta: 'Con TAG pero sin número de serie',
          cantidad: contar(rows, (r) => r.tiene && !r.serie?.trim()),
        },
      ]
    }
    case 'camaras': {
      const rows = filas as unknown as Tables<'camaras'>[]
      const detalle = (fila: Tables<'camaras'>, clave: string) => {
        const objeto = fila.detalle as Record<string, unknown> | null
        return objeto && typeof objeto === 'object' ? objeto[clave] === false : false
      }
      return [
        {
          etiqueta: 'Monitor sin funcionar',
          cantidad: contar(rows, (r) => r.monitor_estado !== 'FUNCIONA'),
          critico: true,
        },
        { etiqueta: 'Cámara delantera con falla', cantidad: contar(rows, (r) => detalle(r, 'camDelantera')) },
        { etiqueta: 'Cámara de cabina con falla', cantidad: contar(rows, (r) => detalle(r, 'camCabina')) },
        { etiqueta: 'Cámaras interiores con falla', cantidad: contar(rows, (r) => detalle(r, 'camInteriores')) },
        { etiqueta: 'Cámara trasera con falla', cantidad: contar(rows, (r) => detalle(r, 'camTrasera')) },
        { etiqueta: 'No activa con la reversa', cantidad: contar(rows, (r) => detalle(r, 'activaReversa')) },
        { etiqueta: 'No activa con las puertas', cantidad: contar(rows, (r) => detalle(r, 'activaPuertas')) },
      ]
    }
    case 'extintores': {
      const rows = filas as unknown as Tables<'extintores'>[]
      return [
        { etiqueta: 'Buses sin extintor', cantidad: contar(rows, (r) => !r.tiene), critico: true },
        {
          etiqueta: 'Certificación vencida',
          cantidad: contar(rows, (r) => r.certificacion === 'VENCIDA'),
          critico: true,
        },
        {
          etiqueta: 'Presión fuera de rango',
          cantidad: contar(rows, (r) => r.presion !== null && r.presion !== 'OPTIMO'),
          critico: true,
        },
        { etiqueta: 'Manómetro con problema', cantidad: contar(rows, (r) => r.manometro !== null && r.manometro !== 'OK') },
        { etiqueta: 'Sonda con problema', cantidad: contar(rows, (r) => r.sonda !== null && r.sonda !== 'OK') },
        { etiqueta: 'Cilindro abollado u oxidado', cantidad: contar(rows, (r) => r.cilindro !== null && r.cilindro !== 'OK') },
        { etiqueta: 'Portaextintor ausente o dañado', cantidad: contar(rows, (r) => r.porta !== null && r.porta !== 'TIENE') },
      ]
    }
    case 'odometro': {
      const rows = filas as unknown as Tables<'odometro'>[]
      return [
        { etiqueta: 'Odómetro sin funcionar', cantidad: contar(rows, (r) => r.estado === 'NO_FUNCIONA'), critico: true },
        { etiqueta: 'Lectura inconsistente', cantidad: contar(rows, (r) => r.estado === 'INCONSISTENTE') },
      ]
    }
    case 'mobileye': {
      const rows = filas as unknown as Tables<'mobileye'>[]
      return [
        { etiqueta: 'Consola dañada', cantidad: contar(rows, (r) => r.consola === false), critico: true },
        { etiqueta: 'Sensor frontal dañado', cantidad: contar(rows, (r) => r.sensor_frontal === false), critico: true },
        { etiqueta: 'Sensor izquierdo dañado', cantidad: contar(rows, (r) => r.sensor_izq === false) },
        { etiqueta: 'Sensor derecho dañado', cantidad: contar(rows, (r) => r.sensor_der === false) },
        { etiqueta: 'Alerta izquierda dañada', cantidad: contar(rows, (r) => r.alerta_izq === false) },
        { etiqueta: 'Alerta derecha dañada', cantidad: contar(rows, (r) => r.alerta_der === false) },
      ]
    }
    case 'rack': {
      const rows = filas as unknown as Tables<'rack'>[]
      return [
        { etiqueta: 'Rack sin disco duro', cantidad: contar(rows, (r) => r.tiene_disco_duro === false), critico: true },
        { etiqueta: 'Sin candado', cantidad: contar(rows, (r) => r.tiene_candado === false), critico: true },
        { etiqueta: 'Cerraduras en mal estado', cantidad: contar(rows, (r) => r.cerraduras_buen_estado === false) },
        { etiqueta: 'Sin seguridad extra del disco', cantidad: contar(rows, (r) => r.tiene_seguridad_extra === false) },
      ]
    }
    case 'wifi': {
      const rows = filas as unknown as Tables<'wifi'>[]
      return [
        { etiqueta: 'Sin conexión a internet', cantidad: contar(rows, (r) => r.tiene_internet === false), critico: true },
        { etiqueta: 'La PPU no aparece en la red', cantidad: contar(rows, (r) => r.ppu_visible === false) },
      ]
    }
    case 'publicidad': {
      const rows = filas as unknown as Tables<'publicidad'>[]
      return [
        { etiqueta: 'Campaña con daño', cantidad: contar(rows, (r) => r.danio === true) },
        { etiqueta: 'Residuos de adhesivo', cantidad: contar(rows, (r) => r.residuos === true) },
        { etiqueta: 'Buses sin campaña instalada', cantidad: contar(rows, (r) => r.tiene === false) },
      ]
    }
    case 'mas15': {
      const rows = filas as unknown as Tables<'mas15'>[]
      return [
        {
          etiqueta: 'Buses sin +15 (el equipo se apaga)',
          cantidad: contar(rows, (r) => r.tiene_mas15 === false),
          critico: true,
        },
        {
          // NULL es "no se pudo medir", no un incumplimiento: se informa
          // aparte para que nadie lo sume a los buses sin +15
          etiqueta: 'No evaluados (el bus no llegó a encender)',
          cantidad: contar(rows, (r) => r.tiene_mas15 === null),
        },
      ]
    }
    case 'normaGrafica': {
      const rows = filas as unknown as Tables<'norma_grafica'>[]
      const columnas = [
        'interno_delantero',
        'interno_trasero',
        'ppu_lateral_derecho',
        'ppu_trasera',
        'patente_delantera',
        'patente_trasera',
      ] as const
      return [
        { etiqueta: 'Buses que no cumplen la norma', cantidad: contar(rows, (r) => !r.cumple), critico: true },
        {
          etiqueta: 'Con algún elemento faltante',
          cantidad: contar(rows, (r) => columnas.some((c) => r[c] === 'FALTA')),
          critico: true,
        },
        { etiqueta: 'N° interno delantero no conforme', cantidad: contar(rows, (r) => r.interno_delantero !== 'OK') },
        { etiqueta: 'N° interno trasero no conforme', cantidad: contar(rows, (r) => r.interno_trasero !== 'OK') },
        { etiqueta: 'PPU lateral derecho no conforme', cantidad: contar(rows, (r) => r.ppu_lateral_derecho !== 'OK') },
        { etiqueta: 'PPU trasera no conforme', cantidad: contar(rows, (r) => r.ppu_trasera !== 'OK') },
        { etiqueta: 'Patente delantera no conforme', cantidad: contar(rows, (r) => r.patente_delantera !== 'OK') },
        { etiqueta: 'Patente trasera no conforme', cantidad: contar(rows, (r) => r.patente_trasera !== 'OK') },
      ]
    }
    default:
      return []
  }
}

/** Cuántos días del período le tocaba a este módulo aparecer en el formulario */
const diasQueAplica = (
  programacion: ProgramacionModulo,
  desde: string,
  hasta: string
): number => {
  let dias = 0
  let cursor = dayjs(desde).startOf('day')
  const fin = dayjs(hasta).endOf('day')
  // El período nunca pasa de unas semanas; recorrerlo día a día es exacto y
  // evita reimplementar la regla de programación aquí
  while (cursor.isBefore(fin) && dias < 400) {
    if (moduloAplicaEn(programacion, cursor).aplica) dias += 1
    cursor = cursor.add(1, 'day')
  }
  return dias
}

export const recopilarDatosEjecutivos = async (
  desdeISO: string,
  hastaISO: string
): Promise<DatosEjecutivos> => {
  const desde = dayjs(desdeISO)
  const hasta = dayjs(hastaISO)
  const diasPeriodo = Math.max(1, hasta.diff(desde, 'day') + 1)

  // Período inmediatamente anterior, del mismo largo, para la tendencia
  const previoHasta = desde.subtract(1, 'millisecond')
  const previoDesde = desde.subtract(diasPeriodo, 'day')

  const modulosConTabla = MODULOS.filter((modulo) => modulo.tabla !== null)

  const [
    { data: flotaData },
    { data: revisionesData },
    { data: historicoData },
    { data: previasData },
    { data: ticketsData },
    { data: configData },
    ...modulosData
  ] = await Promise.all([
    supabase.from('flota').select('*').limit(10000),
    supabase
      .from('revisiones')
      .select('*')
      .gte('created_at', desdeISO)
      .lte('created_at', hastaISO)
      .limit(10000),
    // Última revisión de cada bus hasta el cierre del período: es lo que
    // define el estado real de la flota, aunque el dato venga de antes
    supabase
      .from('revisiones')
      .select('*')
      .lte('created_at', hastaISO)
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase
      .from('revisiones')
      .select('id, bus_ppu, created_at')
      .gte('created_at', previoDesde.toISOString())
      .lte('created_at', previoHasta.toISOString())
      .limit(10000),
    supabase.from('tickets').select('*').limit(10000),
    supabase
      .from('modulos_config')
      .select('clave, activo, tipo, semanas_mes, dias_semana, meses, vigente_desde, vigente_hasta, orden'),
    ...modulosConTabla.map((modulo) =>
      supabase
        .from(modulo.tabla as 'tags')
        .select('*')
        .gte('created_at', desdeISO)
        .lte('created_at', hastaISO)
        .limit(10000)
    ),
  ])

  const flota = (flotaData as FlotaRow[]) ?? []
  const revisiones = (revisionesData as RevisionRow[]) ?? []
  const historico = (historicoData as RevisionRow[]) ?? []
  const previas = (previasData as Pick<RevisionRow, 'id' | 'bus_ppu'>[]) ?? []
  const tickets = (ticketsData as TicketRow[]) ?? []

  /* ------------------------------------------------- Configuración de módulos */

  // Si la tabla no existe todavía el informe no se cae: asume todo activo y
  // lo dice en la portada, que es información relevante para quien lo lee.
  const configDisponible = configData !== null
  const guardadas = new Map(
    ((configData ?? []) as unknown as FilaModuloConfig[]).map((fila) => [
      fila.clave,
      desdeFila(fila),
    ])
  )
  const programacionDe = (clave: ModuloClave, orden: number) =>
    guardadas.get(clave) ?? programacionPorDefecto(clave, orden)

  /* ------------------------------------------------------------ Estado flota */

  const ultimaPorBus = new Map<string, RevisionRow>()
  historico.forEach((revision) => {
    if (!ultimaPorBus.has(revision.bus_ppu)) ultimaPorBus.set(revision.bus_ppu, revision)
  })

  const revisadosSet = new Set(revisiones.map((revision) => revision.bus_ppu))
  const busesRevisados = flota.filter((bus) => revisadosSet.has(bus.ppu)).length
  const totalFlota = flota.length

  const operativos = flota.filter(
    (bus) => ultimaPorBus.get(bus.ppu)?.estado_bus === 'OPERATIVO'
  ).length
  const enPanne = flota.filter(
    (bus) => ultimaPorBus.get(bus.ppu)?.estado_bus === 'EN_PANNE'
  ).length
  const nuncaRevisados = flota.filter((bus) => !ultimaPorBus.has(bus.ppu)).length

  const previosRevisados = new Set(previas.map((revision) => revision.bus_ppu)).size

  /* ---------------------------------------------------------------- Tickets */

  const abiertos = tickets.filter((ticket) => ticket.estado !== 'RESUELTO')
  const nuevos = tickets.filter(
    (ticket) => ticket.created_at >= desdeISO && ticket.created_at <= hastaISO
  )
  const resueltos = tickets.filter(
    (ticket) =>
      ticket.estado === 'RESUELTO' &&
      ticket.actualizado_en >= desdeISO &&
      ticket.actualizado_en <= hastaISO
  )
  const antiguo = abiertos.reduce<number | null>((max, ticket) => {
    const dias = dayjs(hastaISO).diff(dayjs(ticket.created_at), 'day')
    return max === null || dias > max ? dias : max
  }, null)

  /* ------------------------------------------------------------- Terminales */

  const nombresTerminal = [...new Set(flota.map((bus) => bus.terminal))].sort()
  const terminales: ResumenTerminal[] = nombresTerminal.map((terminal) => {
    const buses = flota.filter((bus) => bus.terminal === terminal)
    const revisados = buses.filter((bus) => revisadosSet.has(bus.ppu)).length
    return {
      terminal,
      flota: buses.length,
      revisados,
      avance: pct(revisados, buses.length),
      operativos: buses.filter(
        (bus) => ultimaPorBus.get(bus.ppu)?.estado_bus === 'OPERATIVO'
      ).length,
      enPanne: buses.filter((bus) => ultimaPorBus.get(bus.ppu)?.estado_bus === 'EN_PANNE')
        .length,
      sinRevisar: buses.length - revisados,
    }
  })

  /* ---------------------------------------------------------------- Módulos */

  const modulos: ResumenModulo[] = modulosConTabla.map((modulo, indice) => {
    const filas = ((modulosData[indice]?.data as FilaModulo[] | null) ?? []) as FilaModulo[]
    const programacion = programacionDe(modulo.clave, modulo.orden)
    const estado: EstadoModulo = !programacion.activo
      ? 'apagado'
      : programacion.tipo === 'programado'
        ? 'programado'
        : 'siempre'

    const hallazgos = calcularHallazgos(modulo.clave, filas).filter(
      (hallazgo) => hallazgo.cantidad > 0
    )

    return {
      clave: modulo.clave,
      nombre: modulo.nombre,
      funcion: modulo.funcion,
      estado,
      regla: describirProgramacion(programacion),
      diasAplicables:
        estado === 'apagado' ? 0 : diasQueAplica(programacion, desdeISO, hastaISO),
      registros: filas.length,
      busesDistintos: new Set(filas.map((fila) => fila.bus_ppu)).size,
      cobertura: pct(filas.length, revisiones.length),
      hallazgos,
      totalHallazgos: hallazgos.reduce((suma, hallazgo) => suma + hallazgo.cantidad, 0),
    }
  })

  /* ------------------------------------------------------------- Actividad */

  const porInspectorMapa = new Map<string, { revisiones: number; buses: Set<string> }>()
  revisiones.forEach((revision) => {
    const actual = porInspectorMapa.get(revision.inspector_nombre) ?? {
      revisiones: 0,
      buses: new Set<string>(),
    }
    actual.revisiones += 1
    actual.buses.add(revision.bus_ppu)
    porInspectorMapa.set(revision.inspector_nombre, actual)
  })
  const porInspector = [...porInspectorMapa.entries()]
    .map(([nombre, datos]) => ({
      nombre,
      revisiones: datos.revisiones,
      buses: datos.buses.size,
    }))
    .sort((a, b) => b.revisiones - a.revisiones)

  const porDia: Array<{ etiqueta: string; revisiones: number }> = []
  for (let i = 0; i < diasPeriodo && i < 31; i += 1) {
    const dia = desde.add(i, 'day')
    porDia.push({
      etiqueta: dia.format('ddd DD'),
      revisiones: revisiones.filter((revision) =>
        dayjs(revision.created_at).isSame(dia, 'day')
      ).length,
    })
  }

  /* -------------------------------------------------------- Buses críticos */

  const busesEnPanne = flota
    .filter((bus) => ultimaPorBus.get(bus.ppu)?.estado_bus === 'EN_PANNE')
    .map((bus) => ({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      desde: dayjs(ultimaPorBus.get(bus.ppu)!.created_at).format('DD/MM/YYYY'),
    }))
    .sort((a, b) => a.terminal.localeCompare(b.terminal))

  const busesSinRevisar = flota
    .filter((bus) => !revisadosSet.has(bus.ppu))
    .map((bus) => {
      const ultima = ultimaPorBus.get(bus.ppu)
      return {
        ppu: bus.ppu,
        interno: bus.numero_interno,
        terminal: bus.terminal,
        ultima: ultima ? dayjs(ultima.created_at).format('DD/MM/YYYY') : null,
        // Se conserva el ISO para ordenar: la fecha formateada ordenaría
        // alfabéticamente y pondría "01/12" antes que "30/01"
        ultimaISO: ultima?.created_at ?? null,
      }
    })
    // Por urgencia: primero los que nunca se revisaron, luego los que llevan
    // más tiempo sin mirarse. Es el orden en que hay que atacarlos.
    .sort((a, b) => {
      if (a.ultimaISO === null && b.ultimaISO !== null) return -1
      if (a.ultimaISO !== null && b.ultimaISO === null) return 1
      if (a.ultimaISO === null && b.ultimaISO === null) {
        return a.terminal.localeCompare(b.terminal)
      }
      return (a.ultimaISO as string).localeCompare(b.ultimaISO as string)
    })

  return {
    desde: desdeISO,
    hasta: hastaISO,
    etiquetaPeriodo: `${desde.format('DD/MM/YYYY')} – ${hasta.format('DD/MM/YYYY')}`,
    diasPeriodo,
    semanaIso: desde.isoWeek(),

    totalFlota,
    revisiones: revisiones.length,
    busesRevisados,
    cumplimiento: pct(busesRevisados, totalFlota),
    cumplimientoPrevio: previas.length > 0 ? pct(previosRevisados, totalFlota) : null,
    revisionesPrevias: previas.length,

    operativos,
    enPanne,
    sinDato: totalFlota - operativos - enPanne,
    operatividad: pct(operativos, operativos + enPanne),

    nuncaRevisados,
    sinRevisarEnPeriodo: totalFlota - busesRevisados,

    ticketsAbiertos: abiertos.length,
    ticketsNuevos: nuevos.length,
    ticketsResueltos: resueltos.length,
    ticketsAltos: abiertos.filter((ticket) => ticket.prioridad === 'ALTA').length,
    ticketAntiguoDias: antiguo,

    inspectoresActivos: porInspector.length,
    porInspector,
    porDia,

    terminales,
    modulos,

    busesEnPanne,
    busesSinRevisar,

    configDisponible,
  }
}

/* --------------------------------------------------------- Lectura ejecutiva */

/**
 * Las frases de apertura.
 *
 * Se generan de los datos y no son plantillas vacías: cada una nombra una
 * cifra y, cuando corresponde, la decisión que exige. Un resumen que dice
 * "el desempeño fue satisfactorio" no sirve para nada en una reunión.
 */
const construirConclusiones = (datos: DatosEjecutivos): string[] => {
  const frases: string[] = []

  const tendencia =
    datos.cumplimientoPrevio === null
      ? ''
      : datos.cumplimiento > datos.cumplimientoPrevio + 1
        ? ` Sube ${(datos.cumplimiento - datos.cumplimientoPrevio).toFixed(1)} puntos respecto al período anterior.`
        : datos.cumplimiento < datos.cumplimientoPrevio - 1
          ? ` Cae ${(datos.cumplimientoPrevio - datos.cumplimiento).toFixed(1)} puntos respecto al período anterior.`
          : ' Se mantiene estable respecto al período anterior.'

  frases.push(
    `Se revisaron ${entero(datos.busesRevisados)} de ${entero(datos.totalFlota)} buses (${datos.cumplimiento.toFixed(1)} % de la flota) en ${entero(datos.revisiones)} inspecciones.${tendencia}`
  )

  if (datos.enPanne > 0) {
    frases.push(
      `${entero(datos.enPanne)} buses están en panne según su último registro: la flota opera al ${datos.operatividad.toFixed(1)} % de disponibilidad.`
    )
  } else {
    frases.push(
      `Ningún bus figura en panne en su último registro: la flota está al 100 % de disponibilidad conocida.`
    )
  }

  if (datos.nuncaRevisados > 0) {
    frases.push(
      `${entero(datos.nuncaRevisados)} buses no tienen ningún registro histórico. Sin una primera inspección no hay línea base para ninguno de sus módulos.`
    )
  }

  const modulosApagados = datos.modulos.filter((modulo) => modulo.estado === 'apagado')
  const modulosProgramados = datos.modulos.filter((modulo) => modulo.estado === 'programado')
  if (modulosApagados.length > 0 || modulosProgramados.length > 0) {
    const partes: string[] = []
    if (modulosApagados.length > 0) {
      partes.push(
        `${modulosApagados.length} desactivado${modulosApagados.length !== 1 ? 's' : ''} (${modulosApagados.map((m) => m.nombre).join(', ')})`
      )
    }
    if (modulosProgramados.length > 0) {
      partes.push(
        `${modulosProgramados.length} con programación acotada (${modulosProgramados.map((m) => m.nombre).join(', ')})`
      )
    }
    frases.push(
      `El alcance del check no fue completo: ${partes.join(' y ')}. Sus cifras no son comparables con las de los módulos vigentes todo el período.`
    )
  }

  const criticos = datos.modulos
    .flatMap((modulo) =>
      modulo.hallazgos
        .filter((hallazgo) => hallazgo.critico && hallazgo.cantidad > 0)
        .map((hallazgo) => ({ modulo: modulo.nombre, ...hallazgo }))
    )
    .sort((a, b) => b.cantidad - a.cantidad)

  if (criticos.length > 0) {
    const top = criticos.slice(0, 3)
    frases.push(
      `Hallazgos críticos que exigen decisión: ${top
        .map((hallazgo) => `${hallazgo.etiqueta.toLocaleLowerCase('es')} (${hallazgo.cantidad})`)
        .join('; ')}.`
    )
  } else {
    frases.push('No se detectaron hallazgos críticos en los módulos vigentes del período.')
  }

  if (datos.ticketsAbiertos > 0) {
    frases.push(
      `Quedan ${entero(datos.ticketsAbiertos)} tickets abiertos, ${entero(datos.ticketsAltos)} de prioridad alta${
        datos.ticketAntiguoDias !== null ? `, el más antiguo con ${datos.ticketAntiguoDias} días sin cerrar` : ''
      }. Se resolvieron ${entero(datos.ticketsResueltos)} y se abrieron ${entero(datos.ticketsNuevos)} en el período.`
    )
  }

  if (!datos.configDisponible) {
    frases.push(
      'AVISO: no se pudo leer la configuración de módulos, por lo que este informe asume que todos estaban activos. Ejecuta sql-scripts/modulos-configurables.sql para que el alcance refleje la configuración real.'
    )
  }

  return frases
}

/* ------------------------------------------------------------------ Informe */

export const generarInformeEjecutivo = (datos: DatosEjecutivos) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 14
  const util = ancho - margen * 2

  let y = 0
  let pagina = 0

  /* ------------------------------------------------------------- Andamiaje */

  const pie = () => {
    const yPie = alto - 10
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.3)
    doc.line(margen, yPie, ancho - margen, yPie)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    doc.setTextColor(...SUAVE)
    doc.text(`Mini-Check · Informe ejecutivo de flota · ${datos.etiquetaPeriodo}`, margen, yPie + 4)
    const derecha = `Semana ${datos.semanaIso} · pág. ${pagina}`
    doc.text(derecha, ancho - margen - doc.getTextWidth(derecha), yPie + 4)
  }

  const nuevaPagina = () => {
    // jsPDF ya abre el documento con una página: en la primera llamada sólo
    // hay que tomar posesión de ella, no añadir otra.
    if (pagina > 0) {
      pie()
      doc.addPage()
    }
    pagina += 1
    y = margen + 4
  }

  const reservar = (necesario: number) => {
    if (y + necesario > alto - 16) nuevaPagina()
  }

  const titulo = (texto: string, subtitulo?: string) => {
    if (pagina > 0 && y > margen + 6) y += 5
    // Se reserva sitio para el título Y para algo de contenido: si sólo se
    // reservara el título, podría quedar solo al pie con su sección entera
    // en la página siguiente.
    reservar(subtitulo ? 42 : 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...TINTA)
    const mayus = texto.toLocaleUpperCase('es')
    doc.text(mayus, margen, y)
    doc.setDrawColor(...MARCA)
    doc.setLineWidth(0.8)
    doc.line(margen, y + 1.6, margen + doc.getTextWidth(mayus), y + 1.6)
    y += 6
    if (subtitulo) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...SUAVE)
      const lineas = doc.splitTextToSize(subtitulo, util) as string[]
      doc.text(lineas, margen, y)
      y += lineas.length * 3.2 + 1.5
    } else {
      y += 1
    }
  }

  const parrafo = (texto: string, tamano = 8) => {
    // El troceado usa la fuente ACTIVA: hay que fijarla antes de partir el
    // texto o las líneas se calculan con un tamaño y se pintan con otro, y la
    // última palabra se sale del margen.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tamano)
    doc.setTextColor(...SUAVE)
    const lineas = doc.splitTextToSize(texto, util) as string[]
    reservar(lineas.length * (tamano * 0.42) + 2)
    doc.text(lineas, margen, y)
    y += lineas.length * (tamano * 0.42) + 2.5
  }

  const tarjetas = (
    datosTarjeta: Array<{ etiqueta: string; valor: string; nota?: string; color?: Color }>,
    columnas = 4
  ) => {
    const filas = Math.ceil(datosTarjeta.length / columnas)
    const anchoCelda = util / columnas
    const altoCelda = 18
    reservar(filas * altoCelda + 2)

    datosTarjeta.forEach((dato, indice) => {
      const columna = indice % columnas
      const fila = Math.floor(indice / columnas)
      const x = margen + columna * anchoCelda
      const yCelda = y + fila * altoCelda

      doc.setFillColor(...FONDO)
      doc.roundedRect(x, yCelda, anchoCelda - 2, altoCelda - 2.5, 1.6, 1.6, 'F')

      if (dato.color) {
        doc.setFillColor(dato.color[0], dato.color[1], dato.color[2])
        doc.roundedRect(x, yCelda, 1.4, altoCelda - 2.5, 0.7, 0.7, 'F')
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.2)
      doc.setTextColor(...SUAVE)
      doc.text(dato.etiqueta.toLocaleUpperCase('es'), x + 3.5, yCelda + 4.6)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12.5)
      if (dato.color) doc.setTextColor(dato.color[0], dato.color[1], dato.color[2])
      else doc.setTextColor(...TINTA)
      doc.text(dato.valor, x + 3.5, yCelda + 11)

      if (dato.nota) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.9)
        doc.setTextColor(...SUAVE)
        const nota = doc.splitTextToSize(dato.nota, anchoCelda - 7) as string[]
        doc.text(nota.slice(0, 1), x + 3.5, yCelda + 14.4)
      }
    })

    y += filas * altoCelda + 2
  }

  const barras = (
    datosBarra: Array<{ etiqueta: string; valor: number; resaltado?: boolean; alerta?: boolean }>,
    sufijo = ''
  ) => {
    if (datosBarra.length === 0) return
    const maximo = Math.max(1, ...datosBarra.map((dato) => dato.valor))
    const anchoEtiqueta = 42
    const anchoValor = 16
    const anchoBarra = util - anchoEtiqueta - anchoValor
    const altoFila = 6

    // El bloque entero se reserva de una vez y no fila a fila: las filas se
    // dibujan como `y + indice * altoFila`, así que saltar de página en mitad
    // del bucle dejaría las siguientes apiladas sobre la cabecera nueva.
    reservar(datosBarra.length * altoFila + 2)

    datosBarra.forEach((dato, indice) => {
      const yFila = y + indice * altoFila

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.2)
      doc.setTextColor(...SUAVE)
      let etiqueta = dato.etiqueta
      while (doc.getTextWidth(etiqueta) > anchoEtiqueta - 3 && etiqueta.length > 1) {
        etiqueta = `${etiqueta.slice(0, -2)}…`
      }
      doc.text(etiqueta, margen, yFila + 3.4)

      doc.setFillColor(232, 236, 244)
      doc.roundedRect(margen + anchoEtiqueta, yFila + 0.8, anchoBarra, 3.2, 1.6, 1.6, 'F')

      const largo = (dato.valor / maximo) * anchoBarra
      if (largo > 0) {
        if (dato.alerta) doc.setFillColor(...ROJO)
        else if (dato.resaltado) doc.setFillColor(...MARCA)
        else doc.setFillColor(...GRIS)
        doc.roundedRect(margen + anchoEtiqueta, yFila + 0.8, Math.max(1.8, largo), 3.2, 1.6, 1.6, 'F')
      } else if (dato.alerta) {
        // Sin barra que pintar: se marca el cero con un punto rojo
        doc.setFillColor(...ROJO)
        doc.circle(margen + anchoEtiqueta + 1.6, yFila + 2.4, 1.1, 'F')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.2)
      doc.setTextColor(...TINTA)
      const texto = `${entero(dato.valor)}${sufijo}`
      doc.text(texto, ancho - margen - doc.getTextWidth(texto), yFila + 3.4)
    })

    y += datosBarra.length * altoFila + 3
  }

  /** Barra de composición con leyenda: reparte el 100 % entre segmentos */
  const barraApilada = (
    segmentos: Array<{ etiqueta: string; valor: number; color: Color }>,
    total: number
  ) => {
    reservar(20)
    const altoBarra = 8
    doc.setFillColor(232, 236, 244)
    doc.roundedRect(margen, y, util, altoBarra, 1.6, 1.6, 'F')

    let x = margen
    segmentos.forEach((segmento) => {
      if (segmento.valor <= 0 || total <= 0) return
      const largo = (segmento.valor / total) * util
      doc.setFillColor(segmento.color[0], segmento.color[1], segmento.color[2])
      doc.rect(x, y, largo, altoBarra, 'F')

      // La cifra sólo cabe dentro del segmento si éste es ancho; si no,
      // queda en la leyenda de abajo y no se pinta encima de otro color
      if (largo > 16) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.6)
        doc.setTextColor(255, 255, 255)
        const texto = `${entero(segmento.valor)} · ${pct(segmento.valor, total).toFixed(0)} %`
        doc.text(texto, x + largo / 2 - doc.getTextWidth(texto) / 2, y + 5.4)
      }
      x += largo
    })

    y += altoBarra + 4.5

    let xLeyenda = margen
    segmentos.forEach((segmento) => {
      doc.setFillColor(segmento.color[0], segmento.color[1], segmento.color[2])
      doc.circle(xLeyenda + 1.2, y - 1.2, 1.2, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(...SUAVE)
      const texto = `${segmento.etiqueta}: ${entero(segmento.valor)} (${pct(segmento.valor, total).toFixed(1)} %)`
      doc.text(texto, xLeyenda + 4, y)
      xLeyenda += doc.getTextWidth(texto) + 12
    })

    y += 5
  }

  const tabla = (
    cabeceras: string[],
    filas: Array<{ celdas: string[]; destacar?: boolean; color?: Color }>,
    anchos: number[],
    alineacionDerecha: number[] = []
  ) => {
    const altoFila = 5.4

    const dibujarCabecera = () => {
      reservar(altoFila * 3)
      doc.setFillColor(...TINTA)
      doc.rect(margen, y, util, altoFila, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.4)
      doc.setTextColor(255, 255, 255)
      let x = margen
      cabeceras.forEach((cabecera, indice) => {
        const texto = cabecera.toLocaleUpperCase('es')
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.7)
        } else {
          doc.text(texto, x + 2, y + 3.7)
        }
        x += anchos[indice]
      })
      y += altoFila
    }

    dibujarCabecera()

    filas.forEach((fila, indiceFila) => {
      if (y + altoFila > alto - 16) {
        nuevaPagina()
        dibujarCabecera()
      }

      if (fila.destacar) {
        doc.setFillColor(254, 243, 232)
        doc.rect(margen, y, util, altoFila, 'F')
      } else if (indiceFila % 2 === 0) {
        doc.setFillColor(...FONDO)
        doc.rect(margen, y, util, altoFila, 'F')
      }

      if (fila.color) {
        doc.setFillColor(fila.color[0], fila.color[1], fila.color[2])
        doc.rect(margen, y, 1.2, altoFila, 'F')
      }

      doc.setFont('helvetica', fila.destacar ? 'bold' : 'normal')
      doc.setFontSize(6.9)
      doc.setTextColor(...TINTA)
      let x = margen
      fila.celdas.forEach((celda, indice) => {
        const disponible = anchos[indice] - 4
        let texto = celda
        while (doc.getTextWidth(texto) > disponible && texto.length > 1) {
          texto = `${texto.slice(0, -2)}…`
        }
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.7)
        } else {
          doc.text(texto, x + (fila.color && indice === 0 ? 3.5 : 2), y + 3.7)
        }
        x += anchos[indice]
      })
      y += altoFila
    })

    y += 3
  }

  /* ------------------------------------------------------ Portada ejecutiva */

  nuevaPagina()

  const altoCabecera = 40
  doc.setFillColor(...TINTA)
  doc.rect(0, 0, ancho, altoCabecera, 'F')
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ancho, 2.6, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(160, 174, 198)
  doc.text('MINI-CHECK · CONTROL DE FLOTA', margen, 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text('Informe ejecutivo de flota', margen, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  doc.setTextColor(160, 174, 198)
  doc.text(
    `Semana ${datos.semanaIso}   |   ${datos.etiquetaPeriodo}   |   ${datos.diasPeriodo} días`,
    margen,
    26
  )
  doc.text(
    `Flota de ${entero(datos.totalFlota)} buses en ${datos.terminales.length} terminales   |   Generado el ${dayjs().format('DD/MM/YYYY [a las] HH:mm')} hrs`,
    margen,
    30.5
  )
  doc.text(
    `${datos.modulos.filter((m) => m.estado !== 'apagado').length} de ${datos.modulos.length} módulos de inspección vigentes en el período`,
    margen,
    35
  )

  // Sello de cumplimiento, a la derecha
  const colorSello = semaforo(datos.cumplimiento, 90, 70)
  doc.setFillColor(colorSello[0], colorSello[1], colorSello[2])
  doc.roundedRect(ancho - margen - 40, 7, 40, 26, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  const sello = `${datos.cumplimiento.toFixed(0)}%`
  doc.text(sello, ancho - margen - 20 - doc.getTextWidth(sello) / 2, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.2)
  const etiquetaSello = 'CUMPLIMIENTO DE FLOTA'
  doc.text(etiquetaSello, ancho - margen - 20 - doc.getTextWidth(etiquetaSello) / 2, 24)
  doc.setFontSize(5.8)
  const detalleSello = `${entero(datos.busesRevisados)} de ${entero(datos.totalFlota)} buses`
  doc.text(detalleSello, ancho - margen - 20 - doc.getTextWidth(detalleSello) / 2, 28.5)

  y = altoCabecera + 8

  /* ------------------------------------------------------------- Veredicto */

  titulo('Lectura ejecutiva', 'Lo que hay que saber antes de bajar al detalle')

  construirConclusiones(datos).forEach((frase) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const lineas = doc.splitTextToSize(frase, util - 7) as string[]
    reservar(lineas.length * 3.5 + 3)
    doc.setFillColor(...MARCA)
    doc.circle(margen + 1.4, y - 1.1, 0.9, 'F')
    doc.setTextColor(...TINTA)
    doc.text(lineas, margen + 5, y)
    y += lineas.length * 3.5 + 2
  })

  y += 2

  /* --------------------------------------------------------- Indicadores */

  titulo('Indicadores clave', 'El color marca si el valor está dentro de lo esperado')

  tarjetas([
    {
      etiqueta: 'Flota total',
      valor: entero(datos.totalFlota),
      nota: `${datos.terminales.length} terminales`,
    },
    {
      etiqueta: 'Buses revisados',
      valor: entero(datos.busesRevisados),
      nota: `${entero(datos.sinRevisarEnPeriodo)} sin revisar`,
      color: semaforo(datos.cumplimiento, 90, 70),
    },
    {
      etiqueta: 'Cumplimiento',
      valor: `${datos.cumplimiento.toFixed(1)} %`,
      nota:
        datos.cumplimientoPrevio !== null
          ? `período anterior: ${datos.cumplimientoPrevio.toFixed(1)} %`
          : 'sin período anterior',
      color: semaforo(datos.cumplimiento, 90, 70),
    },
    {
      etiqueta: 'Inspecciones',
      valor: entero(datos.revisiones),
      nota: `${entero(datos.revisionesPrevias)} en el período anterior`,
    },
    {
      etiqueta: 'Operatividad',
      valor: `${datos.operatividad.toFixed(1)} %`,
      nota: 'sobre buses con estado conocido',
      color: semaforo(datos.operatividad, 95, 85),
    },
    {
      etiqueta: 'Buses en panne',
      valor: entero(datos.enPanne),
      nota: 'según su último registro',
      color: datos.enPanne > 0 ? ROJO : VERDE,
    },
    {
      etiqueta: 'Tickets abiertos',
      valor: entero(datos.ticketsAbiertos),
      nota: `${entero(datos.ticketsAltos)} de prioridad alta`,
      color: datos.ticketsAltos > 0 ? ROJO : datos.ticketsAbiertos > 0 ? AMBAR : VERDE,
    },
    {
      etiqueta: 'Inspectores activos',
      valor: entero(datos.inspectoresActivos),
      nota:
        datos.inspectoresActivos > 0
          ? `${(datos.revisiones / datos.inspectoresActivos).toFixed(1)} revisiones c/u`
          : 'sin actividad',
      color: datos.inspectoresActivos > 0 ? undefined : ROJO,
    },
  ])

  /* ------------------------------------------------------- Estado de flota */

  titulo(
    'Estado de la flota',
    'Cada bus se clasifica por su ÚLTIMO registro conocido, aunque sea anterior al período: es el único estado real que se puede afirmar'
  )

  barraApilada(
    [
      { etiqueta: 'Operativos', valor: datos.operativos, color: VERDE },
      { etiqueta: 'En panne', valor: datos.enPanne, color: ROJO },
      { etiqueta: 'Sin registro histórico', valor: datos.sinDato, color: GRIS },
    ],
    datos.totalFlota
  )

  parrafo(
    `El nivel de operatividad (${datos.operatividad.toFixed(1)} %) se calcula sobre los ${entero(
      datos.operativos + datos.enPanne
    )} buses con estado conocido. Los ${entero(
      datos.sinDato
    )} buses sin ningún registro quedan fuera del cálculo a propósito: contarlos como operativos inflaría el indicador y contarlos como panne lo hundiría, y en ninguno de los dos casos sería cierto.`
  )

  /* ---------------------------------------------------- Avance por terminal */

  titulo('Avance por terminal', 'Dónde se concentra lo que falta por revisar')

  tabla(
    ['Terminal', 'Flota', 'Revisados', '% avance', 'Operativos', 'En panne', 'Sin revisar'],
    datos.terminales.map((terminal) => ({
      color: semaforo(terminal.avance, 90, 70),
      destacar: terminal.avance < 70,
      celdas: [
        terminal.terminal,
        entero(terminal.flota),
        entero(terminal.revisados),
        `${terminal.avance.toFixed(1)} %`,
        entero(terminal.operativos),
        entero(terminal.enPanne),
        entero(terminal.sinRevisar),
      ],
    })),
    // La suma de anchos no puede pasar de `util` (187.9 mm en carta): al
    // excederlo, las últimas columnas se pintan fuera del margen derecho
    [46, 20, 24, 24, 24, 22, 26],
    [1, 2, 3, 4, 5, 6]
  )

  barras(
    datos.terminales.map((terminal) => ({
      etiqueta: terminal.terminal,
      valor: Math.round(terminal.avance),
      resaltado: terminal.avance >= 90,
      alerta: terminal.avance < 70,
    })),
    ' %'
  )

  /* -------------------------------------------------------- Alcance del check */

  titulo(
    'Alcance del check: qué se revisó y qué no',
    'Un módulo apagado o programado no es un incumplimiento, es un "no correspondía". Esta tabla separa una cosa de la otra antes de mostrar cualquier cifra'
  )

  const etiquetaEstado: Record<EstadoModulo, string> = {
    siempre: 'ACTIVO',
    programado: 'PROGRAMADO',
    apagado: 'DESACTIVADO',
  }
  const colorEstado: Record<EstadoModulo, Color> = {
    siempre: VERDE,
    programado: MARCA,
    apagado: GRIS,
  }

  tabla(
    ['Módulo', 'Estado', 'Regla de aparición', 'Días aplica', 'Registros', 'Buses', 'Cobertura'],
    datos.modulos.map((modulo) => ({
      color: colorEstado[modulo.estado],
      // Se resalta lo que hay que explicar: estaba vigente y aun así apenas
      // se capturó dato
      destacar:
        modulo.estado !== 'apagado' && modulo.diasAplicables > 0 && modulo.cobertura < 60,
      celdas: [
        modulo.nombre,
        etiquetaEstado[modulo.estado],
        modulo.regla,
        modulo.estado === 'apagado'
          ? '—'
          : `${modulo.diasAplicables} de ${datos.diasPeriodo}`,
        entero(modulo.registros),
        entero(modulo.busesDistintos),
        modulo.estado === 'apagado' ? '—' : `${modulo.cobertura.toFixed(0)} %`,
      ],
    })),
    [30, 24, 50, 22, 22, 18, 20],
    [3, 4, 5, 6]
  )

  y += 1.5

  parrafo(
    `La cobertura se calcula sobre las ${entero(
      datos.revisiones
    )} inspecciones del período: un 100 % significa que el módulo se capturó en todas ellas. Los módulos desactivados no muestran cobertura porque no se pidieron en el formulario, y un 0 % ahí sería una lectura falsa.`
  )

  /* --------------------------------------------------- Detalle por módulo */

  titulo(
    'Detalle por módulo',
    'Cada módulo con su función, lo que se capturó y los hallazgos encontrados'
  )

  datos.modulos.forEach((modulo) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    const lineasFuncion = doc.splitTextToSize(modulo.funcion, util - 8) as string[]
    const filasHallazgo = modulo.hallazgos.length
    const altoBloque =
      11 + lineasFuncion.length * 3 + (filasHallazgo > 0 ? filasHallazgo * 4 + 2 : 4)

    reservar(altoBloque + 3)

    doc.setFillColor(...FONDO)
    doc.roundedRect(margen, y, util, altoBloque, 1.8, 1.8, 'F')
    const color = colorEstado[modulo.estado]
    doc.setFillColor(color[0], color[1], color[2])
    doc.roundedRect(margen, y, 1.8, altoBloque, 0.9, 0.9, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TINTA)
    doc.text(modulo.nombre, margen + 5, y + 5)
    // El ancho hay que medirlo con la fuente del NOMBRE, no con la de la
    // etiqueta: midiéndolo a 5.6 pt salía corto y el badge se montaba encima
    const anchoNombre = doc.getTextWidth(modulo.nombre)

    // Etiqueta de estado, justo detrás del nombre
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.6)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(etiquetaEstado[modulo.estado], margen + 5 + anchoNombre + 2.5, y + 4.6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    doc.setTextColor(...SUAVE)
    const resumen =
      modulo.estado === 'apagado'
        ? `Desactivado en Configuración · ${entero(modulo.registros)} registros heredados en el período`
        : `${entero(modulo.registros)} registros · ${entero(modulo.busesDistintos)} buses · ${modulo.cobertura.toFixed(0)} % de cobertura · ${modulo.regla}`
    doc.text(resumen, ancho - margen - 3 - doc.getTextWidth(resumen), y + 5)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...SUAVE)
    doc.text(lineasFuncion, margen + 5, y + 9)

    let yHallazgo = y + 9 + lineasFuncion.length * 3 + 2.5

    if (filasHallazgo === 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.8)
      const colorNota: Color = modulo.registros > 0 ? VERDE : GRIS
      doc.setTextColor(colorNota[0], colorNota[1], colorNota[2])
      doc.text(
        modulo.registros > 0
          ? 'Sin hallazgos en el período.'
          : modulo.estado === 'apagado'
            ? 'No se pidió en el formulario durante el período.'
            : 'Sin registros capturados en el período.',
        margen + 5,
        yHallazgo
      )
    } else {
      modulo.hallazgos.forEach((hallazgo) => {
        const colorHallazgo = hallazgo.critico ? ROJO : AMBAR
        doc.setFillColor(colorHallazgo[0], colorHallazgo[1], colorHallazgo[2])
        doc.circle(margen + 6.4, yHallazgo - 1, 0.9, 'F')

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.9)
        doc.setTextColor(...TINTA)
        doc.text(hallazgo.etiqueta, margen + 9, yHallazgo)

        const cifra = `${entero(hallazgo.cantidad)}${
          modulo.registros > 0 ? `  (${pct(hallazgo.cantidad, modulo.registros).toFixed(0)} %)` : ''
        }`
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.9)
        doc.setTextColor(colorHallazgo[0], colorHallazgo[1], colorHallazgo[2])
        doc.text(cifra, ancho - margen - 3 - doc.getTextWidth(cifra), yHallazgo)

        yHallazgo += 4
      })
    }

    y += altoBloque + 3
  })

  /* ------------------------------------------------- Hallazgos que deciden */

  const criticos = datos.modulos
    .flatMap((modulo) =>
      modulo.hallazgos
        .filter((hallazgo) => hallazgo.critico)
        .map((hallazgo) => ({
          modulo: modulo.nombre,
          etiqueta: hallazgo.etiqueta,
          cantidad: hallazgo.cantidad,
          base: modulo.registros,
        }))
    )
    .sort((a, b) => b.cantidad - a.cantidad)

  titulo(
    `Hallazgos críticos (${criticos.length})`,
    'Los que comprometen seguridad, operación o cumplimiento normativo. Ordenados por volumen'
  )

  if (criticos.length === 0) {
    parrafo('No se detectaron hallazgos críticos en los módulos vigentes del período.')
  } else {
    tabla(
      ['Módulo', 'Hallazgo', 'Casos', '% del módulo'],
      criticos.map((hallazgo) => ({
        color: ROJO,
        celdas: [
          hallazgo.modulo,
          hallazgo.etiqueta,
          entero(hallazgo.cantidad),
          hallazgo.base > 0 ? `${pct(hallazgo.cantidad, hallazgo.base).toFixed(1)} %` : '—',
        ],
      })),
      [34, 96, 26, 30],
      [2, 3]
    )
  }

  /* ---------------------------------------------------------------- Tickets */

  titulo(
    'Tickets de mantenimiento',
    'Los tickets se abren solos desde los hallazgos del formulario; el saldo abierto es acumulado, no sólo del período'
  )

  tarjetas(
    [
      {
        etiqueta: 'Abiertos',
        valor: entero(datos.ticketsAbiertos),
        nota: 'saldo acumulado',
        color: datos.ticketsAbiertos > 0 ? AMBAR : VERDE,
      },
      {
        etiqueta: 'Prioridad alta',
        valor: entero(datos.ticketsAltos),
        nota: 'dentro del saldo abierto',
        color: datos.ticketsAltos > 0 ? ROJO : VERDE,
      },
      {
        etiqueta: 'Abiertos en el período',
        valor: entero(datos.ticketsNuevos),
        nota: 'nuevos hallazgos',
      },
      {
        etiqueta: 'Resueltos en el período',
        valor: entero(datos.ticketsResueltos),
        nota:
          datos.ticketAntiguoDias !== null
            ? `el más antiguo lleva ${datos.ticketAntiguoDias} días`
            : 'sin pendientes antiguos',
        color: datos.ticketsResueltos >= datos.ticketsNuevos ? VERDE : AMBAR,
      },
    ],
    4
  )

  if (datos.ticketsNuevos > datos.ticketsResueltos) {
    parrafo(
      `Se abrieron ${entero(datos.ticketsNuevos)} tickets y se cerraron ${entero(
        datos.ticketsResueltos
      )}: el saldo pendiente creció en ${entero(
        datos.ticketsNuevos - datos.ticketsResueltos
      )} durante el período.`
    )
  }

  /* --------------------------------------------------------- Buses críticos */

  if (datos.busesEnPanne.length > 0) {
    titulo(
      `Buses en panne (${datos.busesEnPanne.length})`,
      'Detectados en panne en su última inspección. La fecha es la de ese registro'
    )
    tabla(
      ['PPU', 'N° interno', 'Terminal', 'Detectado el', 'Días fuera'],
      datos.busesEnPanne.map((bus) => {
        const dias = dayjs(datos.hasta).diff(dayjs(bus.desde, 'DD/MM/YYYY'), 'day')
        return {
          color: dias >= 30 ? ROJO : AMBAR,
          // El resalte se reserva a los casos excepcionales: marcando todo lo
          // de más de 30 días se resaltaban dos tercios de la tabla y dejaba
          // de señalar nada
          destacar: dias >= 60,
          celdas: [
            bus.ppu,
            bus.interno,
            bus.terminal,
            bus.desde,
            Number.isFinite(dias) && dias >= 0 ? entero(dias) : '—',
          ],
        }
      }),
      [32, 30, 56, 38, 30],
      [4]
    )
  }

  if (datos.busesSinRevisar.length > 0) {
    const nunca = datos.busesSinRevisar.filter((bus) => bus.ultima === null)
    titulo(
      `Buses sin revisar en el período (${datos.busesSinRevisar.length})`,
      nunca.length > 0
        ? `${nunca.length} no tienen ningún registro histórico y encabezan la lista`
        : 'Todos tienen registro histórico previo al período'
    )

    // Reparto por terminal antes del listado: en una reunión se decide sobre
    // el terminal que acumula el rezago, no sobre una PPU concreta
    tabla(
      ['Terminal', 'Sin revisar', 'Sobre su flota', 'Nunca revisados'],
      datos.terminales.map((terminal) => {
        const nuncaTerminal = nunca.filter(
          (bus) => bus.terminal === terminal.terminal
        ).length
        return {
          color: semaforo(100 - pct(terminal.sinRevisar, terminal.flota), 90, 70),
          celdas: [
            terminal.terminal,
            entero(terminal.sinRevisar),
            `${pct(terminal.sinRevisar, terminal.flota).toFixed(1)} %`,
            entero(nuncaTerminal),
          ],
        }
      }),
      [64, 40, 42, 40],
      [1, 2, 3]
    )

    // El listado nominal se acota: un anexo de 300 patentes convierte el
    // informe en un archivo y deja de leerse. El completo está en el XLSX.
    // 30 filas: entra en media página y deja sitio a las secciones que
    // siguen. Más allá de eso el anexo empuja el cierre a una página nueva
    // casi vacía y no aporta nada que el XLSX no tenga mejor.
    const TOPE = 30
    const listado = datos.busesSinRevisar.slice(0, TOPE)
    tabla(
      ['PPU', 'N° interno', 'Terminal', 'Última revisión conocida'],
      listado.map((bus) => ({
        color: bus.ultima === null ? ROJO : undefined,
        destacar: bus.ultima === null,
        celdas: [bus.ppu, bus.interno, bus.terminal, bus.ultima ?? 'NUNCA REVISADO'],
      })),
      [34, 32, 60, 60]
    )
    if (datos.busesSinRevisar.length > TOPE) {
      parrafo(
        `Se listan los ${TOPE} más urgentes de ${datos.busesSinRevisar.length}. El listado completo, bus por bus, está en el XLSX de todos los módulos.`,
        7
      )
    }
  }

  /* ------------------------------------------------------ Actividad equipo */

  titulo('Actividad del equipo', 'Reparto de las inspecciones del período')

  if (datos.porInspector.length === 0) {
    parrafo('No se registraron inspecciones en el período.')
  } else {
    tabla(
      ['Inspector', 'Inspecciones', 'Buses distintos', '% del total'],
      datos.porInspector.map((inspector) => ({
        celdas: [
          inspector.nombre,
          entero(inspector.revisiones),
          entero(inspector.buses),
          `${pct(inspector.revisiones, datos.revisiones).toFixed(1)} %`,
        ],
      })),
      [80, 34, 36, 36],
      [1, 2, 3]
    )
  }

  titulo('Ritmo diario', 'En rojo, los días sin ninguna inspección')
  barras(
    datos.porDia.map((dia) => ({
      etiqueta: dia.etiqueta,
      valor: dia.revisiones,
      alerta: dia.revisiones === 0,
    }))
  )

  /* ------------------------------------------------------------ Metodología */

  titulo('Cómo leer este informe')
  parrafo(
    'El cumplimiento de flota mide cuántos buses distintos recibieron al menos una inspección dentro del período, sobre el total de la flota. Un bus inspeccionado tres veces cuenta una sola vez: el indicador mide alcance, no volumen de trabajo.'
  )
  parrafo(
    'El estado de cada bus —operativo o en panne— se toma de su última inspección conocida, aunque sea anterior al período. Es lo único que se puede afirmar: un bus no inspeccionado esta semana no cambió de estado por no haberlo mirado.'
  )
  parrafo(
    'El alcance del check depende de la configuración de módulos. Un módulo desactivado no aparece en el formulario y por eso no muestra cobertura; uno programado sólo aparece los días que indica su regla, y su cobertura debe leerse contra esos días, no contra el período completo.'
  )
  parrafo(
    'Los hallazgos marcados como críticos son los que comprometen seguridad (extintores, cámaras, Mobileye), operación (sin TAG, sin +15, odómetro sin funcionar) o cumplimiento normativo (norma gráfica). El resto son hallazgos de mantenimiento programable.'
  )

  reservar(12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.4)
  doc.setTextColor(...SUAVE)
  doc.text(
    `Informe generado el ${dayjs().format('DD/MM/YYYY [a las] HH:mm')} hrs sobre ${entero(
      datos.revisiones
    )} inspecciones, ${entero(datos.totalFlota)} buses y ${datos.modulos.length} módulos de inspección.`,
    margen,
    y + 3
  )

  pie()
  return doc
}

/**
 * Descarga el informe ejecutivo del período indicado.
 *
 * Mantiene la firma anterior para no obligar a tocar los botones que ya lo
 * llaman desde el dashboard y desde Reportes.
 */
export const exportExecutivePdf = async (startDate?: string, endDate?: string) => {
  const desde = startDate ?? dayjs().isoWeekday(1).startOf('day').toISOString()
  const hasta = endDate ?? dayjs().isoWeekday(1).add(6, 'day').endOf('day').toISOString()

  const datos = await recopilarDatosEjecutivos(desde, hasta)
  const doc = generarInformeEjecutivo(datos)

  doc.save(
    `Informe_Ejecutivo_Flota_S${datos.semanaIso}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`
  )
  return doc
}
