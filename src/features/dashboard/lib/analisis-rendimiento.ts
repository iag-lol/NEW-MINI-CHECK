import dayjs from '@/lib/dayjs'
import type { Dayjs } from 'dayjs'
import { closestTerminalDistance } from '@/lib/geofence'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>

/* -------------------------------------------------------------------------
   Reglas del análisis

   El eje del cálculo es el TURNO, no el día de calendario. Agrupar por fecha
   mezclaba el descanso entre jornadas con las pausas de trabajo: alguien que
   fichaba a las 05:00 y volvía a las 23:23 aparecía con "una pausa de 18 h",
   cuando en realidad eran dos turnos distintos con su descanso en medio.

   Los umbrales se calculan además sobre el propio historial del colaborador.
   Un inspector de terminal grande y otro de terminal chico no comparten
   ritmo, así que "revisó poco" sólo tiene sentido comparado con lo que esa
   persona hace habitualmente.
   ------------------------------------------------------------------------- */

/** Hueco a partir del cual dos revisiones pertenecen a turnos distintos */
const CORTE_TURNO_MIN = 300

/** Pausa dentro de un mismo turno que merece señalarse */
const PAUSA_LARGA_MIN = 150

/**
 * Hora a la que se considera que empieza una nueva jornada laboral. Una
 * revisión de las 03:00 pertenece al turno que arrancó la noche anterior,
 * no al día nuevo: sin esto, cada turno de noche contaba como dos días
 * trabajados y partía la jornada en dos mitades sin sentido.
 */
const CORTE_JORNADA_HORA = 6

/** Un turno que arranca dentro de esta franja se clasifica como nocturno */
const NOCHE_DESDE = 18
const NOCHE_HASTA = 6

/** Domingo no cuenta como día laborable a la hora de detectar ausencias */
const DIA_NO_LABORABLE = 0

/** Proporción de la mediana diaria por debajo de la cual la jornada es floja */
const FACTOR_DIA_BAJO = 0.5

/** Proporción de la mediana semanal por debajo de la cual la semana es floja */
const FACTOR_SEMANA_BAJA = 0.6

export type Severidad = 'critica' | 'alta' | 'media' | 'info'
export type TipoTurno = 'dia' | 'noche'

export interface Alerta {
  severidad: Severidad
  titulo: string
  detalle: string
  /** Qué hacer con esto: es lo que convierte el dato en decisión */
  accion?: string
}

export interface TurnoTrabajado {
  id: string
  /** Día al que se imputa el turno (el de su inicio) */
  fechaJornada: string
  tipo: TipoTurno
  inicio: string
  fin: string
  inicioHora: string
  finHora: string
  duracionMin: number
  revisiones: number
  busesDistintos: number
  enPanne: number
  /** Minutos medios entre revisiones consecutivas DENTRO del turno */
  cadenciaMediaMin: number | null
  cadenciaMedianaMin: number | null
  /** Pausa más larga dentro del turno */
  pausaMaxMin: number | null
  ritmoPorHora: number | null
  cruzaMedianoche: boolean
}

export interface ResumenJornada {
  fecha: string
  etiqueta: string
  revisiones: number
  turnos: TurnoTrabajado[]
  minutosTrabajados: number
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
  parcial: boolean
}

export interface HorarioTurno {
  turnos: number
  entrada: string | null
  salida: string | null
  duracionMedianaMin: number | null
  revisionesPorTurno: number | null
}

export interface PatronTurnos {
  totalTurnos: number
  turnosDia: number
  turnosNoche: number
  duracionMediaMin: number | null
  duracionMedianaMin: number | null
  revisionesPorTurno: number | null
  ritmoMedioPorHora: number | null
  /**
   * Horario típico separado por tipo de turno. Promediar las entradas de un
   * turno de mañana y uno de noche daba una hora intermedia inexistente
   * ("entra habitualmente a las 03:06" para alguien que nunca entra a esa
   * hora), así que cada tipo se resume por separado.
   */
  horarios: Record<TipoTurno, HorarioTurno>
  turnoDominante: TipoTurno | 'mixto' | null
}

export interface AnalisisRendimiento {
  rut: string
  nombre: string
  periodoEtiqueta: string
  desde: string
  hasta: string

  total: number
  busesDistintos: number
  operativos: number
  enPanne: number
  terminales: string[]

  diasDelPeriodo: number
  diasLaborables: number
  diasActivos: number
  diasAusentes: string[]
  cobertura: number
  rachaMaxima: number
  promedioPorDiaActivo: number
  medianaPorDiaActivo: number

  /* Turnos */
  turnos: TurnoTrabajado[]
  patron: PatronTurnos
  horasTrabajadas: number

  /* Cadencia — siempre dentro del turno */
  cadenciaMediaMin: number | null
  cadenciaMedianaMin: number | null
  pausaMaximaMin: number | null
  pausaMaximaTurno: TurnoTrabajado | null

  porJornada: ResumenJornada[]
  porSemana: ResumenSemana[]
  mejorSemana: ResumenSemana | null
  peorSemanaActiva: ResumenSemana | null
  semanasAusentes: ResumenSemana[]
  porDiaSemana: Array<{ etiqueta: string; revisiones: number }>
  porFranja: Array<{ etiqueta: string; revisiones: number }>

  conGps: number
  dentroGeocerca: number
  precisionGps: number | null
  distanciaMediaM: number | null
  tasaOperativa: number | null

  alertas: Alerta[]
  puntuacion: number
  notaGlobal: string
  componentes: Array<{ etiqueta: string; valor: number; peso: number }>
  /** Frases de cierre para que el supervisor decida sin releer el informe */
  conclusiones: string[]
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

/** Día laboral al que pertenece una marca horaria (la madrugada es del día anterior) */
const fechaJornada = (momento: Dayjs) =>
  (momento.hour() < CORTE_JORNADA_HORA ? momento.subtract(1, 'day') : momento).format(
    'YYYY-MM-DD'
  )

const clasificarTurno = (inicio: Dayjs): TipoTurno =>
  inicio.hour() >= NOCHE_DESDE || inicio.hour() < NOCHE_HASTA ? 'noche' : 'dia'

/** Media de horas del reloj, tratándolas como ángulos: 23:50 y 00:10 dan 00:00 */
const horaMedia = (momentos: Dayjs[]): string | null => {
  if (momentos.length === 0) return null
  let sumaSeno = 0
  let sumaCoseno = 0
  momentos.forEach((momento) => {
    const angulo = ((momento.hour() * 60 + momento.minute()) / 1440) * 2 * Math.PI
    sumaSeno += Math.sin(angulo)
    sumaCoseno += Math.cos(angulo)
  })
  let anguloMedio = Math.atan2(sumaSeno / momentos.length, sumaCoseno / momentos.length)
  if (anguloMedio < 0) anguloMedio += 2 * Math.PI
  const minutos = Math.round((anguloMedio / (2 * Math.PI)) * 1440) % 1440
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(
    minutos % 60
  ).padStart(2, '0')}`
}

const FRANJAS = [
  { etiqueta: 'Madrugada (00-06)', desde: 0, hasta: 6 },
  { etiqueta: 'Mañana (06-12)', desde: 6, hasta: 12 },
  { etiqueta: 'Tarde (12-18)', desde: 12, hasta: 18 },
  { etiqueta: 'Noche (18-24)', desde: 18, hasta: 24 },
]

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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
    const desde = primeraRevision
      ? dayjs(primeraRevision).startOf('day')
      : ahora.startOf('day')
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

/* -------------------------------------------------------- Detección de turnos */

/**
 * Parte la secuencia de revisiones en turnos.
 *
 * Se abre un turno nuevo cuando entre dos revisiones consecutivas pasan más
 * de `CORTE_TURNO_MIN` minutos: ese hueco es descanso, no trabajo. Todo lo que
 * queda dentro de un turno sí es tiempo de faena, y es ahí donde tiene sentido
 * medir el ritmo.
 */
export const detectarTurnos = (revisiones: Revision[]): TurnoTrabajado[] => {
  if (revisiones.length === 0) return []

  const orden = [...revisiones].sort(
    (a, b) => new Date(a.created_at).valueOf() - new Date(b.created_at).valueOf()
  )

  const grupos: Revision[][] = []
  let actual: Revision[] = [orden[0]]

  for (let i = 1; i < orden.length; i += 1) {
    const anterior = dayjs(orden[i - 1].created_at)
    const siguiente = dayjs(orden[i].created_at)
    if (siguiente.diff(anterior, 'minute') > CORTE_TURNO_MIN) {
      grupos.push(actual)
      actual = [orden[i]]
    } else {
      actual.push(orden[i])
    }
  }
  grupos.push(actual)

  return grupos.map((grupo, indice) => {
    const inicio = dayjs(grupo[0].created_at)
    const fin = dayjs(grupo[grupo.length - 1].created_at)

    const huecos: number[] = []
    for (let i = 1; i < grupo.length; i += 1) {
      huecos.push(
        dayjs(grupo[i].created_at).diff(dayjs(grupo[i - 1].created_at), 'minute')
      )
    }

    const duracionMin = fin.diff(inicio, 'minute')

    return {
      id: `${grupo[0].id}-${indice}`,
      fechaJornada: fechaJornada(inicio),
      tipo: clasificarTurno(inicio),
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      inicioHora: inicio.format('HH:mm'),
      finHora: fin.format('HH:mm'),
      duracionMin,
      revisiones: grupo.length,
      busesDistintos: new Set(grupo.map((rev) => rev.bus_ppu)).size,
      enPanne: grupo.filter((rev) => rev.estado_bus === 'EN_PANNE').length,
      cadenciaMediaMin: media(huecos),
      cadenciaMedianaMin: mediana(huecos),
      pausaMaxMin: huecos.length > 0 ? Math.max(...huecos) : null,
      ritmoPorHora:
        duracionMin >= 30
          ? Math.round((grupo.length / (duracionMin / 60)) * 10) / 10
          : null,
      cruzaMedianoche: !inicio.isSame(fin, 'day'),
    }
  })
}

/* --------------------------------------------------------------- Análisis */

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

  const turnos = detectarTurnos(orden)

  /* ------------------------------------------------------- Cadencia real */

  // Todos los huecos entre revisiones consecutivas, descartando los que
  // separan un turno del siguiente: ésos son descanso, no ritmo de trabajo.
  const cadencias: number[] = []
  for (let i = 1; i < orden.length; i += 1) {
    const diferencia = dayjs(orden[i].created_at).diff(
      dayjs(orden[i - 1].created_at),
      'minute'
    )
    if (diferencia <= CORTE_TURNO_MIN) cadencias.push(diferencia)
  }

  const pausaMaximaTurno =
    turnos.length > 0
      ? turnos.reduce<TurnoTrabajado | null>((peor, turno) => {
          if (turno.pausaMaxMin === null) return peor
          if (!peor || (peor.pausaMaxMin ?? 0) < turno.pausaMaxMin) return turno
          return peor
        }, null)
      : null

  /* -------------------------------------------------- Agrupación por jornada */

  const porFecha = new Map<string, TurnoTrabajado[]>()
  turnos.forEach((turno) => {
    const lista = porFecha.get(turno.fechaJornada)
    if (lista) lista.push(turno)
    else porFecha.set(turno.fechaJornada, [turno])
  })

  const porJornada: ResumenJornada[] = [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, turnosDelDia]) => ({
      fecha,
      etiqueta: dayjs(fecha).format('ddd DD MMM'),
      revisiones: turnosDelDia.reduce((acc, turno) => acc + turno.revisiones, 0),
      turnos: turnosDelDia,
      minutosTrabajados: turnosDelDia.reduce((acc, turno) => acc + turno.duracionMin, 0),
      busesDistintos: turnosDelDia.reduce((acc, turno) => acc + turno.busesDistintos, 0),
      enPanne: turnosDelDia.reduce((acc, turno) => acc + turno.enPanne, 0),
    }))

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

  const conteosDiarios = porJornada.map((dia) => dia.revisiones)
  const medianaDiaria = mediana(conteosDiarios) ?? 0
  const promedioDiario = media(conteosDiarios) ?? 0

  /* ------------------------------------------------------- Patrón de turnos */

  const duraciones = turnos.filter((t) => t.duracionMin > 0).map((t) => t.duracionMin)
  const turnosDeDia = turnos.filter((t) => t.tipo === 'dia')
  const turnosDeNoche = turnos.filter((t) => t.tipo === 'noche')
  const minutosTotales = duraciones.reduce((acc, v) => acc + v, 0)
  const horasTrabajadas = Math.round((minutosTotales / 60) * 10) / 10

  const resumirHorario = (lista: TurnoTrabajado[]): HorarioTurno => ({
    turnos: lista.length,
    entrada: horaMedia(lista.map((t) => dayjs(t.inicio))),
    salida: horaMedia(lista.map((t) => dayjs(t.fin))),
    duracionMedianaMin: mediana(lista.map((t) => t.duracionMin)),
    revisionesPorTurno:
      lista.length > 0
        ? Math.round(
            (lista.reduce((acc, t) => acc + t.revisiones, 0) / lista.length) * 10
          ) / 10
        : null,
  })

  const patron: PatronTurnos = {
    totalTurnos: turnos.length,
    turnosDia: turnosDeDia.length,
    turnosNoche: turnosDeNoche.length,
    duracionMediaMin: media(duraciones),
    duracionMedianaMin: mediana(duraciones),
    revisionesPorTurno:
      turnos.length > 0 ? Math.round((orden.length / turnos.length) * 10) / 10 : null,
    // Ritmo global (revisiones / horas efectivas). Promediar el ritmo de cada
    // turno daba el mismo peso a uno de dos revisiones que a uno de doce, y
    // los turnos cortos inflaban la cifra.
    ritmoMedioPorHora:
      minutosTotales > 0
        ? Math.round((orden.length / (minutosTotales / 60)) * 10) / 10
        : null,
    horarios: {
      dia: resumirHorario(turnosDeDia),
      noche: resumirHorario(turnosDeNoche),
    },
    turnoDominante:
      turnos.length === 0
        ? null
        : turnosDeDia.length >= turnos.length * 0.75
          ? 'dia'
          : turnosDeNoche.length >= turnos.length * 0.75
            ? 'noche'
            : 'mixto',
  }

  /* ------------------------------------------------------------- Por semana */

  const porSemanaMapa = new Map<
    string,
    { revisiones: number; dias: Set<string>; inicio: Dayjs; completa: boolean }
  >()

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

  // Las revisiones se imputan a la semana de su JORNADA, no a la del reloj:
  // un turno de noche del sábado que termina el domingo pertenece al sábado.
  porJornada.forEach((jornada) => {
    const fecha = dayjs(jornada.fecha)
    const clave = `${fecha.isoWeekYear()}-W${String(fecha.isoWeek()).padStart(2, '0')}`
    const entrada = porSemanaMapa.get(clave) ?? {
      revisiones: 0,
      dias: new Set<string>(),
      inicio: fecha.isoWeekday(1).startOf('day'),
      completa: true,
    }
    entrada.revisiones += jornada.revisiones
    entrada.dias.add(jornada.fecha)
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
      ausente: valor.revisiones === 0 && valor.completa,
      parcial: !valor.completa,
    }))

  const semanasActivas = porSemana.filter((semana) => semana.revisiones > 0)
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
    conteoDiaSemana[dayjs(fechaJornada(fecha)).day()] += 1
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
  const precisionGps = conGps.length > 0 ? (dentroGeocerca / conGps.length) * 100 : null

  /* -------------------------------------------------------------- Alertas */

  const alertas: Alerta[] = []
  const cobertura =
    diasLaborables.length > 0 ? (porJornada.length / diasLaborables.length) * 100 : 0

  if (orden.length === 0) {
    alertas.push({
      severidad: 'critica',
      titulo: 'Sin actividad en el período',
      detalle: 'No se registró ninguna revisión en el rango analizado.',
      accion:
        'Confirmar si hubo licencia, vacaciones o cambio de turno antes de escalar.',
    })
  }

  semanasAusentes.forEach((semana) => {
    alertas.push({
      severidad: 'critica',
      titulo: `Semana ${semana.numero} sin revisiones`,
      detalle: `La semana del ${dayjs(semana.inicio).format(
        'DD [de] MMMM'
      )} no tiene ninguna revisión registrada.`,
      accion: 'Cruzar con el libro de asistencia: ausencia justificada o no reportada.',
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
          detalle: `${semana.revisiones} revisiones en ${semana.diasActivos} día${
            semana.diasActivos !== 1 ? 's' : ''
          }, frente a una mediana de ${medianaSemanal} por semana.`,
          accion: 'Revisar si coincide con turno reducido, feriado o falta de buses.',
        })
      })
  }

  if (medianaDiaria > 0) {
    const umbralDia = Math.max(1, Math.round(medianaDiaria * FACTOR_DIA_BAJO))
    const diasFlojos = porJornada.filter((dia) => dia.revisiones < umbralDia)
    if (diasFlojos.length > 0) {
      alertas.push({
        severidad: 'media',
        titulo: `${diasFlojos.length} jornada${diasFlojos.length !== 1 ? 's' : ''} con volumen bajo`,
        detalle: `Por debajo de ${umbralDia} revisiones (mediana diaria: ${medianaDiaria}): ${diasFlojos
          .slice(0, 6)
          .map((dia) => `${dayjs(dia.fecha).format('DD MMM')} (${dia.revisiones})`)
          .join(', ')}${diasFlojos.length > 6 ? '…' : '.'}`,
        accion: 'Contrastar con la duración del turno de esos días antes de concluir.',
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
        .join(', ')}${diasAusentes.length > 8 ? '…' : '.'}`,
      accion: 'Verificar libranzas y turnos asignados: puede ser descanso programado.',
    })
  }

  // Pausas: sólo cuentan las de DENTRO de un turno. El descanso entre turnos
  // ya no aparece aquí, que era justo el falso positivo de 18 horas.
  const turnosConPausaLarga = turnos.filter(
    (turno) => (turno.pausaMaxMin ?? 0) > PAUSA_LARGA_MIN
  )
  if (turnosConPausaLarga.length > 0) {
    const peor = turnosConPausaLarga.reduce((a, b) =>
      (a.pausaMaxMin ?? 0) > (b.pausaMaxMin ?? 0) ? a : b
    )
    alertas.push({
      severidad: 'media',
      titulo: `${turnosConPausaLarga.length} turno${
        turnosConPausaLarga.length !== 1 ? 's' : ''
      } con una pausa larga`,
      detalle: `La mayor fue el ${dayjs(peor.fechaJornada).format('DD [de] MMMM')} (turno de ${
        peor.tipo === 'noche' ? 'noche' : 'día'
      }, ${peor.inicioHora}–${peor.finHora}): ${formatearMinutos(
        peor.pausaMaxMin
      )} sin registrar ninguna revisión.`,
      accion: 'Preguntar por colación, traslado entre terminales o falla de equipo.',
    })
  }

  if (precisionGps !== null && precisionGps < 70) {
    alertas.push({
      severidad: 'alta',
      titulo: 'Revisiones fuera de las geocercas',
      detalle: `Sólo el ${precisionGps.toFixed(
        0
      )} % de las revisiones con GPS cae dentro del perímetro de un terminal.`,
      accion: 'Validar en el mapa del colaborador si el patrón es sistemático.',
    })
  }

  const sinGps = orden.length - conGps.length
  if (sinGps > 0) {
    alertas.push({
      severidad: 'info',
      titulo: `${sinGps} ${sinGps === 1 ? 'revisión' : 'revisiones'} sin coordenadas`,
      detalle:
        'No se pudo validar la ubicación de esas revisiones. Suele indicar el GPS desactivado en el dispositivo.',
      accion: 'Recordar mantener la ubicación activa durante el turno.',
    })
  }

  if (alertas.length === 0) {
    alertas.push({
      severidad: 'info',
      titulo: 'Sin incidencias detectadas',
      detalle:
        'Constancia, ritmo dentro del turno y ubicación se mantienen dentro de lo esperado para este colaborador.',
      accion: 'Sin acción requerida.',
    })
  }

  /* ----------------------------------------------------------- Puntuación */

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

  /* --------------------------------------------------------- Conclusiones */

  const conclusiones: string[] = []

  if (patron.totalTurnos > 0) {
    const describir = (tipo: TipoTurno) => {
      const horario = patron.horarios[tipo]
      const nombre = tipo === 'dia' ? 'día' : 'noche'
      return `${horario.turnos} de ${nombre} (${horario.entrada}–${horario.salida}, ${formatearMinutos(
        horario.duracionMedianaMin
      )})`
    }

    const partes: string[] = []
    if (patron.turnosDia > 0) partes.push(describir('dia'))
    if (patron.turnosNoche > 0) partes.push(describir('noche'))

    conclusiones.push(
      `Trabajó ${patron.totalTurnos} turnos en el período: ${partes.join(
        ' y '
      )}. Promedia ${patron.revisionesPorTurno} revisiones por turno, a ${patron.ritmoMedioPorHora} por hora efectiva.`
    )
  }

  conclusiones.push(
    `Cubre ${porJornada.length} de ${diasLaborables.length} días laborables (${cobertura.toFixed(
      0
    )} %), con una racha máxima de ${rachaMaxima} días seguidos.`
  )

  if (mejorSemana) {
    conclusiones.push(
      `Su mejor semana fue la ${mejorSemana.numero} con ${mejorSemana.revisiones} revisiones;` +
        (semanasAusentes.length === 0
          ? ' no hay semanas en blanco.'
          : semanasAusentes.length === 1
            ? ` quedó 1 semana sin ninguna actividad (la ${semanasAusentes[0].numero}).`
            : ` quedaron ${semanasAusentes.length} semanas sin ninguna actividad.`)
    )
  }

  if (precisionGps !== null) {
    conclusiones.push(
      `El ${precisionGps.toFixed(0)} % de sus revisiones se registró dentro de la geocerca de un terminal, a ${
        medidas.length > 0
          ? Math.round(medidas.reduce((acc, m) => acc + m.distance, 0) / medidas.length)
          : 0
      } m de media.`
    )
  }

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
    diasActivos: porJornada.length,
    diasAusentes,
    cobertura,
    rachaMaxima,
    promedioPorDiaActivo: promedioDiario,
    medianaPorDiaActivo: medianaDiaria,

    turnos,
    patron,
    horasTrabajadas,

    cadenciaMediaMin: media(cadencias),
    cadenciaMedianaMin: mediana(cadencias),
    pausaMaximaMin: pausaMaximaTurno?.pausaMaxMin ?? null,
    pausaMaximaTurno,

    porJornada,
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
    conclusiones,
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

export const etiquetaTurno = (tipo: TipoTurno) => (tipo === 'noche' ? 'Noche' : 'Día')
