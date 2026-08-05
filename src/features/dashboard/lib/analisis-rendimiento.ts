import dayjs from '@/lib/dayjs'
import type { Dayjs } from 'dayjs'
import { closestTerminalDistance } from '@/lib/geofence'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>

/* -------------------------------------------------------------------------
   Reglas del análisis

   Los umbrales se calculan sobre el propio historial del colaborador en vez
   de fijarse a mano. Un inspector de terminal grande y otro de terminal chico
   no comparten ritmo, así que "revisó poco" sólo tiene sentido comparado con
   lo que esa persona hace habitualmente.
   ------------------------------------------------------------------------- */

/** Domingo no cuenta como día laborable a la hora de detectar ausencias */
const DIA_NO_LABORABLE = 0

/** Un hueco mayor a esto dentro de la misma jornada se marca como inactividad */
const HUECO_LARGO_MIN = 150

/** Proporción de la mediana diaria por debajo de la cual el día es flojo */
const FACTOR_DIA_BAJO = 0.5

/** Proporción de la mediana semanal por debajo de la cual la semana es floja */
const FACTOR_SEMANA_BAJA = 0.6

export type Severidad = 'critica' | 'alta' | 'media' | 'info'

export interface Alerta {
  severidad: Severidad
  titulo: string
  detalle: string
}

export interface ResumenDia {
  fecha: string
  etiqueta: string
  revisiones: number
  primera: string
  ultima: string
  /** Minutos entre la primera y la última revisión del día */
  jornadaMin: number
  /** Minutos medios entre revisiones consecutivas del día */
  cadenciaMediaMin: number | null
  /** Hueco más largo del día, en minutos */
  huecoMaxMin: number | null
  busesDistintos: number
  enPanne: number
}

export interface ResumenSemana {
  clave: string
  numero: number
  inicio: string
  etiqueta: string
  revisiones: number
  diasActivos: number
  ausente: boolean
  /** La semana queda recortada por el borde del período seleccionado */
  parcial: boolean
}

export interface AnalisisRendimiento {
  /* Identidad y período */
  rut: string
  nombre: string
  periodoEtiqueta: string
  desde: string
  hasta: string

  /* Volumen */
  total: number
  busesDistintos: number
  operativos: number
  enPanne: number
  terminales: string[]

  /* Constancia */
  diasDelPeriodo: number
  diasLaborables: number
  diasActivos: number
  diasAusentes: string[]
  cobertura: number
  rachaMaxima: number
  promedioPorDiaActivo: number
  medianaPorDiaActivo: number

  /* Cadencia */
  cadenciaMediaMin: number | null
  cadenciaMedianaMin: number | null
  huecoMaximoMin: number | null
  huecoMaximoFecha: string | null
  jornadaMediaMin: number | null
  revisionesPorHora: number | null

  /* Reparto */
  porDia: ResumenDia[]
  porSemana: ResumenSemana[]
  mejorSemana: ResumenSemana | null
  peorSemanaActiva: ResumenSemana | null
  semanasAusentes: ResumenSemana[]
  porDiaSemana: Array<{ etiqueta: string; revisiones: number }>
  porFranja: Array<{ etiqueta: string; revisiones: number }>

  /* Calidad */
  conGps: number
  dentroGeocerca: number
  precisionGps: number | null
  distanciaMediaM: number | null
  tasaOperativa: number | null

  /* Diagnóstico */
  alertas: Alerta[]
  puntuacion: number
  notaGlobal: string
  componentes: Array<{ etiqueta: string; valor: number; peso: number }>
}

export interface PeriodoAnalisis {
  etiqueta: string
  desde: Dayjs
  hasta: Dayjs
}

/* ------------------------------------------------------------------ Utils */

const mediana = (valores: number[]): number | null => {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 0
    ? Math.round((orden[medio - 1] + orden[medio]) / 2)
    : orden[medio]
}

const media = (valores: number[]): number | null =>
  valores.length === 0
    ? null
    : Math.round(valores.reduce((acc, v) => acc + v, 0) / valores.length)

const conGpsValido = (rev: Revision) =>
  typeof rev.lat === 'number' && typeof rev.lon === 'number' && rev.lat !== 0

const FRANJAS = [
  { etiqueta: 'Madrugada (00-06)', desde: 0, hasta: 6 },
  { etiqueta: 'Mañana (06-12)', desde: 6, hasta: 12 },
  { etiqueta: 'Tarde (12-18)', desde: 12, hasta: 18 },
  { etiqueta: 'Noche (18-24)', desde: 18, hasta: 24 },
]

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/**
 * Rango temporal a partir del filtro de la pantalla. `hasta` nunca supera el
 * momento actual: contar como ausentes días que todavía no han ocurrido
 * falsearía la cobertura hacia abajo.
 */
export const construirPeriodo = (
  modo: 'semana' | '1m' | '2m' | 'all',
  semanaInicio: Dayjs,
  primeraRevision?: string
): PeriodoAnalisis => {
  const ahora = dayjs()

  if (modo === 'semana') {
    const fin = semanaInicio.add(7, 'day')
    return {
      etiqueta: `Semana ${semanaInicio.isoWeek()} · ${semanaInicio.format(
        'DD MMM'
      )} – ${fin.subtract(1, 'day').format('DD MMM YYYY')}`,
      desde: semanaInicio,
      hasta: fin.isAfter(ahora) ? ahora : fin,
    }
  }

  if (modo === 'all') {
    const desde = primeraRevision ? dayjs(primeraRevision).startOf('day') : ahora.startOf('day')
    return {
      etiqueta: `Historial completo · desde ${desde.format('DD MMM YYYY')}`,
      desde,
      hasta: ahora,
    }
  }

  const meses = modo === '1m' ? 1 : 2
  return {
    etiqueta: meses === 1 ? 'Último mes' : 'Últimos 2 meses',
    desde: ahora.subtract(meses, 'month').startOf('day'),
    hasta: ahora,
  }
}

/* --------------------------------------------------------------- Análisis */

/**
 * Chequeo de rendimiento completo de un colaborador sobre un período.
 *
 * `revisiones` debe venir ya acotada al período; el rango se usa además para
 * saber qué días *deberían* tener actividad y poder detectar ausencias, algo
 * que no se puede deducir mirando sólo las revisiones existentes.
 */
export const analizarRendimiento = (
  revisiones: Revision[],
  periodo: PeriodoAnalisis,
  identidad: {
    rut: string
    nombre: string
    /**
     * Primera revisión de toda su historia, no sólo del período. Nadie puede
     * estar ausente antes de existir: sin este dato, analizar "los últimos dos
     * meses" de alguien que entró hace tres semanas lo acusaba de faltar cinco
     * semanas enteras.
     */
    inicioActividad?: string
  }
): AnalisisRendimiento => {
  const orden = [...revisiones].sort(
    (a, b) => new Date(a.created_at).valueOf() - new Date(b.created_at).valueOf()
  )

  /* ------------------------------------------------------ Agrupación diaria */

  const porFecha = new Map<string, Revision[]>()
  orden.forEach((rev) => {
    const clave = dayjs(rev.created_at).format('YYYY-MM-DD')
    const lista = porFecha.get(clave)
    if (lista) lista.push(rev)
    else porFecha.set(clave, [rev])
  })

  const todasLasCadencias: number[] = []
  let huecoMaximoMin: number | null = null
  let huecoMaximoFecha: string | null = null

  const porDia: ResumenDia[] = [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, revs]) => {
      const marcas = revs.map((rev) => dayjs(rev.created_at))
      const primera = marcas[0]
      const ultima = marcas[marcas.length - 1]

      // Tiempo entre revisiones consecutivas dentro de la misma jornada
      const huecos: number[] = []
      for (let i = 1; i < marcas.length; i += 1) {
        const diferencia = marcas[i].diff(marcas[i - 1], 'minute')
        huecos.push(diferencia)
        todasLasCadencias.push(diferencia)
      }

      const huecoMax = huecos.length > 0 ? Math.max(...huecos) : null
      if (huecoMax !== null && (huecoMaximoMin === null || huecoMax > huecoMaximoMin)) {
        huecoMaximoMin = huecoMax
        huecoMaximoFecha = fecha
      }

      return {
        fecha,
        etiqueta: dayjs(fecha).format('ddd DD MMM'),
        revisiones: revs.length,
        primera: primera.format('HH:mm'),
        ultima: ultima.format('HH:mm'),
        jornadaMin: ultima.diff(primera, 'minute'),
        cadenciaMediaMin: media(huecos),
        huecoMaxMin: huecoMax,
        busesDistintos: new Set(revs.map((rev) => rev.bus_ppu)).size,
        enPanne: revs.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
      }
    })

  /* ------------------------------------------------------ Calendario y racha */

  const diasDelPeriodo: string[] = []
  const diasLaborables: string[] = []

  const inicioReal = identidad.inicioActividad
    ? dayjs(identidad.inicioActividad).startOf('day')
    : null
  const arranque =
    inicioReal && inicioReal.isAfter(periodo.desde)
      ? inicioReal
      : periodo.desde.startOf('day')

  let cursor = arranque
  const limite = periodo.hasta.startOf('day')

  // Tope de seguridad: un historial corrupto no debe colgar el navegador
  let guardia = 0
  while (!cursor.isAfter(limite) && guardia < 3660) {
    const clave = cursor.format('YYYY-MM-DD')
    diasDelPeriodo.push(clave)
    if (cursor.day() !== DIA_NO_LABORABLE) diasLaborables.push(clave)
    cursor = cursor.add(1, 'day')
    guardia += 1
  }

  const diasActivosSet = new Set(porFecha.keys())
  const diasAusentes = diasLaborables.filter((dia) => !diasActivosSet.has(dia))

  let rachaMaxima = 0
  let rachaActual = 0
  diasLaborables.forEach((dia) => {
    if (diasActivosSet.has(dia)) {
      rachaActual += 1
      rachaMaxima = Math.max(rachaMaxima, rachaActual)
    } else {
      rachaActual = 0
    }
  })

  const conteosDiarios = porDia.map((dia) => dia.revisiones)
  const medianaDiaria = mediana(conteosDiarios) ?? 0
  const promedioDiario = media(conteosDiarios) ?? 0

  /* ------------------------------------------------------------- Por semana */

  const porSemanaMapa = new Map<
    string,
    { revisiones: number; dias: Set<string>; inicio: Dayjs; completa: boolean }
  >()

  // Se siembran todas las semanas del período, también las vacías: una semana
  // sin ninguna revisión es precisamente el dato que hay que ver.
  let cursorSemana = arranque.isoWeekday(1).startOf('day')
  let guardiaSemana = 0
  while (!cursorSemana.isAfter(periodo.hasta) && guardiaSemana < 530) {
    const clave = `${cursorSemana.isoWeekYear()}-W${String(cursorSemana.isoWeek()).padStart(2, '0')}`
    if (!porSemanaMapa.has(clave)) {
      // Una semana sólo es "completa" si sus siete días caben dentro del
      // período. Las de los bordes salen recortadas por el filtro, no por
      // inactividad, y acusarlas de ausencia sería un falso positivo.
      const completa =
        !cursorSemana.isBefore(arranque) &&
        !cursorSemana.add(6, 'day').isAfter(periodo.hasta)
      porSemanaMapa.set(clave, {
        revisiones: 0,
        dias: new Set(),
        inicio: cursorSemana,
        completa,
      })
    }
    cursorSemana = cursorSemana.add(1, 'week')
    guardiaSemana += 1
  }

  orden.forEach((rev) => {
    const fecha = dayjs(rev.created_at)
    const clave = `${fecha.isoWeekYear()}-W${String(fecha.isoWeek()).padStart(2, '0')}`
    const entrada = porSemanaMapa.get(clave) ?? {
      revisiones: 0,
      dias: new Set<string>(),
      inicio: fecha.isoWeekday(1).startOf('day'),
      completa: true,
    }
    entrada.revisiones += 1
    entrada.dias.add(fecha.format('YYYY-MM-DD'))
    porSemanaMapa.set(clave, entrada)
  })

  const porSemana: ResumenSemana[] = [...porSemanaMapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, valor]) => ({
      clave,
      numero: valor.inicio.isoWeek(),
      inicio: valor.inicio.format('YYYY-MM-DD'),
      etiqueta: `S${valor.inicio.isoWeek()} · ${valor.inicio.format('DD MMM')}`,
      revisiones: valor.revisiones,
      diasActivos: valor.dias.size,
      // Sólo se declara ausente una semana entera dentro del período
      ausente: valor.revisiones === 0 && valor.completa,
      parcial: !valor.completa,
    }))

  const semanasActivas = porSemana.filter((semana) => !semana.ausente)
  const mejorSemana =
    semanasActivas.length > 0
      ? semanasActivas.reduce((mejor, actual) =>
          actual.revisiones > mejor.revisiones ? actual : mejor
        )
      : null
  const peorSemanaActiva =
    semanasActivas.length > 0
      ? semanasActivas.reduce((peor, actual) =>
          actual.revisiones < peor.revisiones ? actual : peor
        )
      : null
  const semanasAusentes = porSemana.filter((semana) => semana.ausente)
  const medianaSemanal = mediana(semanasActivas.map((s) => s.revisiones)) ?? 0

  /* --------------------------------------------------- Reparto por día/hora */

  const conteoDiaSemana = new Array(7).fill(0)
  const conteoFranja = new Array(FRANJAS.length).fill(0)
  orden.forEach((rev) => {
    const fecha = dayjs(rev.created_at)
    conteoDiaSemana[fecha.day()] += 1
    const indice = FRANJAS.findIndex(
      (franja) => fecha.hour() >= franja.desde && fecha.hour() < franja.hasta
    )
    if (indice >= 0) conteoFranja[indice] += 1
  })

  /* ------------------------------------------------------------- Calidad GPS */

  const conGps = orden.filter(conGpsValido)
  const medidas = conGps.map((rev) => closestTerminalDistance(rev.lat, rev.lon))
  const dentroGeocerca = medidas.filter((m) => m.inside).length
  const operativos = orden.filter((rev) => rev.estado_bus === 'OPERATIVO').length

  /* ------------------------------------------------------------- Cadencia */

  const jornadasConVarias = porDia.filter((dia) => dia.revisiones > 1)
  const jornadaMediaMin = media(jornadasConVarias.map((dia) => dia.jornadaMin))
  const revisionesPorHora =
    jornadaMediaMin && jornadaMediaMin > 0
      ? Math.round(
          (media(jornadasConVarias.map((dia) => dia.revisiones)) ?? 0) /
            (jornadaMediaMin / 60) *
            10
        ) / 10
      : null

  /* -------------------------------------------------------------- Alertas */

  const alertas: Alerta[] = []
  const cobertura =
    diasLaborables.length > 0 ? (porDia.length / diasLaborables.length) * 100 : 0

  if (orden.length === 0) {
    alertas.push({
      severidad: 'critica',
      titulo: 'Sin actividad en el período',
      detalle:
        'No se registró ninguna revisión en el rango analizado. Conviene confirmar si hubo licencia, cambio de turno o un problema con la aplicación.',
    })
  }

  semanasAusentes.forEach((semana) => {
    alertas.push({
      severidad: 'critica',
      titulo: `Semana ${semana.numero} sin revisiones`,
      detalle: `La semana del ${dayjs(semana.inicio).format(
        'DD [de] MMMM'
      )} no tiene ninguna revisión registrada.`,
    })
  })

  if (medianaSemanal > 0) {
    const umbralSemana = Math.max(1, Math.round(medianaSemanal * FACTOR_SEMANA_BAJA))
    semanasActivas
      .filter((semana) => !semana.parcial && semana.revisiones < umbralSemana)
      .forEach((semana) => {
        alertas.push({
          severidad: 'alta',
          titulo: `Semana ${semana.numero} por debajo de lo habitual`,
          detalle: `${semana.revisiones} revisiones frente a una mediana de ${medianaSemanal} por semana.`,
        })
      })
  }

  if (medianaDiaria > 0) {
    const umbralDia = Math.max(1, Math.round(medianaDiaria * FACTOR_DIA_BAJO))
    const diasFlojos = porDia.filter((dia) => dia.revisiones < umbralDia)
    if (diasFlojos.length > 0) {
      alertas.push({
        severidad: 'media',
        titulo: `${diasFlojos.length} jornada${diasFlojos.length !== 1 ? 's' : ''} con volumen bajo`,
        detalle: `Días por debajo de ${umbralDia} revisiones (mediana diaria: ${medianaDiaria}): ${diasFlojos
          .slice(0, 6)
          .map((dia) => `${dayjs(dia.fecha).format('DD MMM')} (${dia.revisiones})`)
          .join(', ')}${diasFlojos.length > 6 ? '…' : ''}.`,
      })
    }
  }

  if (diasAusentes.length > 0) {
    alertas.push({
      severidad: diasAusentes.length > diasLaborables.length / 2 ? 'alta' : 'media',
      titulo: `${diasAusentes.length} día${diasAusentes.length !== 1 ? 's' : ''} laborable${
        diasAusentes.length !== 1 ? 's' : ''
      } sin registro`,
      detalle: `Sin revisiones el ${diasAusentes
        .slice(0, 8)
        .map((dia) => dayjs(dia).format('DD MMM'))
        .join(', ')}${diasAusentes.length > 8 ? '…' : ''}.`,
    })
  }

  if (huecoMaximoMin !== null && huecoMaximoMin > HUECO_LARGO_MIN) {
    const horas = Math.floor(huecoMaximoMin / 60)
    const minutos = huecoMaximoMin % 60
    alertas.push({
      severidad: 'media',
      titulo: 'Pausa larga dentro de una jornada',
      detalle: `El ${dayjs(huecoMaximoFecha ?? undefined).format(
        'DD [de] MMMM'
      )} pasaron ${horas} h ${minutos} min entre dos revisiones consecutivas.`,
    })
  }

  const precisionGps = conGps.length > 0 ? (dentroGeocerca / conGps.length) * 100 : null
  if (precisionGps !== null && precisionGps < 70) {
    alertas.push({
      severidad: 'alta',
      titulo: 'Revisiones fuera de las geocercas',
      detalle: `Sólo el ${precisionGps.toFixed(
        0
      )} % de las revisiones con GPS cae dentro del perímetro de un terminal.`,
    })
  }

  const sinGps = orden.length - conGps.length
  if (sinGps > 0) {
    alertas.push({
      severidad: 'info',
      titulo: `${sinGps} ${sinGps === 1 ? 'revisión' : 'revisiones'} sin coordenadas`,
      detalle:
        'No se pudo validar la ubicación de esas revisiones. Suele indicar el GPS desactivado en el dispositivo.',
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      severidad: 'info',
      titulo: 'Sin incidencias detectadas',
      detalle:
        'La constancia, el ritmo y la ubicación de las revisiones se mantienen dentro de lo esperado para este colaborador.',
    })
  }

  /* ----------------------------------------------------------- Puntuación */

  // Cuatro componentes con pesos explícitos. La constancia manda: revisar
  // todos los días es lo que sostiene el control de flota.
  const compConstancia = Math.min(100, cobertura)
  const compVolumen =
    medianaDiaria > 0 ? Math.min(100, (promedioDiario / medianaDiaria) * 100) : 0
  const compUbicacion = precisionGps ?? 100
  const compRegularidad =
    porSemana.length > 0
      ? Math.max(0, 100 - (semanasAusentes.length / porSemana.length) * 100)
      : 100

  const componentes = [
    { etiqueta: 'Constancia diaria', valor: Math.round(compConstancia), peso: 0.4 },
    { etiqueta: 'Volumen sostenido', valor: Math.round(compVolumen), peso: 0.2 },
    { etiqueta: 'Ubicación válida', valor: Math.round(compUbicacion), peso: 0.25 },
    { etiqueta: 'Regularidad semanal', valor: Math.round(compRegularidad), peso: 0.15 },
  ]

  const puntuacion = Math.round(
    componentes.reduce((acc, componente) => acc + componente.valor * componente.peso, 0)
  )

  const notaGlobal =
    puntuacion >= 85
      ? 'Excelente'
      : puntuacion >= 70
        ? 'Bueno'
        : puntuacion >= 50
          ? 'Irregular'
          : 'Requiere seguimiento'

  return {
    rut: identidad.rut,
    nombre: identidad.nombre,
    periodoEtiqueta: periodo.etiqueta,
    desde: periodo.desde.format('YYYY-MM-DD'),
    hasta: periodo.hasta.format('YYYY-MM-DD'),

    total: orden.length,
    busesDistintos: new Set(orden.map((rev) => rev.bus_ppu)).size,
    operativos,
    enPanne: orden.length - operativos,
    terminales: [
      ...new Set(orden.map((rev) => rev.terminal_reportado || rev.terminal_detectado)),
    ].filter(Boolean),

    diasDelPeriodo: diasDelPeriodo.length,
    diasLaborables: diasLaborables.length,
    diasActivos: porDia.length,
    diasAusentes,
    cobertura,
    rachaMaxima,
    promedioPorDiaActivo: promedioDiario,
    medianaPorDiaActivo: medianaDiaria,

    cadenciaMediaMin: media(todasLasCadencias),
    cadenciaMedianaMin: mediana(todasLasCadencias),
    huecoMaximoMin,
    huecoMaximoFecha,
    jornadaMediaMin,
    revisionesPorHora,

    porDia,
    porSemana,
    mejorSemana,
    peorSemanaActiva,
    semanasAusentes,
    porDiaSemana: DIAS_SEMANA.map((etiqueta, indice) => ({
      etiqueta,
      revisiones: conteoDiaSemana[indice],
    })),
    porFranja: FRANJAS.map((franja, indice) => ({
      etiqueta: franja.etiqueta,
      revisiones: conteoFranja[indice],
    })),

    conGps: conGps.length,
    dentroGeocerca,
    precisionGps,
    distanciaMediaM:
      medidas.length > 0
        ? Math.round(medidas.reduce((acc, m) => acc + m.distance, 0) / medidas.length)
        : null,
    tasaOperativa: orden.length > 0 ? (operativos / orden.length) * 100 : null,

    alertas,
    puntuacion,
    notaGlobal,
    componentes,
  }
}

/** "95 min" -> "1 h 35 min" */
export const formatearMinutos = (minutos: number | null): string => {
  if (minutos === null) return '—'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}
