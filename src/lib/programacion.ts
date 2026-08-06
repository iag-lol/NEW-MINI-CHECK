import dayjs from '@/lib/dayjs'
import type { Dayjs } from 'dayjs'
import type { ModuloClave } from '@/constants/modulos'

/**
 * Programación de módulos de inspección.
 *
 * Un módulo puede estar activo siempre o sólo en ciertas fechas, con reglas
 * que se repiten indefinidamente (por ejemplo "sólo la 1ª y la 3ª semana de
 * cada mes"). Todas las condiciones que se rellenen deben cumplirse a la vez;
 * las que quedan vacías no filtran nada.
 */

export type TipoProgramacion = 'siempre' | 'programado'

export interface ProgramacionModulo {
  clave: ModuloClave
  activo: boolean
  tipo: TipoProgramacion
  /**
   * Ordinal de la semana dentro del mes (1 a 5). Se cuenta por bloques de
   * siete días naturales: los días 1-7 son la semana 1, los 8-14 la 2, etc.
   * Es la lectura intuitiva de "la primera semana del mes"; usar semanas ISO
   * haría que el día 1 cayera a veces en la última semana del mes anterior.
   */
  semanasDelMes: number[]
  /** Días de la semana en formato ISO: 1 = lunes … 7 = domingo */
  diasSemana: number[]
  /** Meses del año: 1 = enero … 12 = diciembre */
  meses: number[]
  /** Ventana absoluta, para campañas con fecha de inicio y fin */
  vigenteDesde: string | null
  vigenteHasta: string | null
  orden: number
}

export const programacionPorDefecto = (
  clave: ModuloClave,
  orden = 0
): ProgramacionModulo => ({
  clave,
  activo: true,
  tipo: 'siempre',
  semanasDelMes: [],
  diasSemana: [],
  meses: [],
  vigenteDesde: null,
  vigenteHasta: null,
  orden,
})

/** Ordinal de la semana dentro del mes (1 a 5) para una fecha dada. */
export const semanaDelMes = (fecha: Dayjs): number =>
  Math.ceil(fecha.date() / 7)

export interface ResultadoAplica {
  aplica: boolean
  /** Por qué no aplica, para poder explicarlo en pantalla */
  motivo?: string
}

/**
 * ¿Este módulo debe aparecer en el formulario en la fecha indicada?
 */
export const moduloAplicaEn = (
  programacion: ProgramacionModulo,
  fecha: Dayjs = dayjs()
): ResultadoAplica => {
  if (!programacion.activo) {
    return { aplica: false, motivo: 'Desactivado en Configuración' }
  }

  if (programacion.tipo === 'siempre') return { aplica: true }

  if (programacion.vigenteDesde) {
    const desde = dayjs(programacion.vigenteDesde).startOf('day')
    if (fecha.isBefore(desde)) {
      return {
        aplica: false,
        motivo: `Programado a partir del ${desde.format('DD MMM YYYY')}`,
      }
    }
  }

  if (programacion.vigenteHasta) {
    const hasta = dayjs(programacion.vigenteHasta).endOf('day')
    if (fecha.isAfter(hasta)) {
      return {
        aplica: false,
        motivo: `Vigencia terminada el ${hasta.format('DD MMM YYYY')}`,
      }
    }
  }

  if (programacion.meses.length > 0 && !programacion.meses.includes(fecha.month() + 1)) {
    return { aplica: false, motivo: 'No corresponde a este mes' }
  }

  if (
    programacion.semanasDelMes.length > 0 &&
    !programacion.semanasDelMes.includes(semanaDelMes(fecha))
  ) {
    return {
      aplica: false,
      motivo: `No corresponde a la semana ${semanaDelMes(fecha)} del mes`,
    }
  }

  if (
    programacion.diasSemana.length > 0 &&
    !programacion.diasSemana.includes(fecha.isoWeekday())
  ) {
    return { aplica: false, motivo: 'No corresponde a este día de la semana' }
  }

  return { aplica: true }
}

const NOMBRES_SEMANA = ['1ª', '2ª', '3ª', '4ª', '5ª']
const NOMBRES_DIA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const NOMBRES_MES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/** Resumen legible de la regla, para mostrarlo junto al módulo. */
export const describirProgramacion = (programacion: ProgramacionModulo): string => {
  if (!programacion.activo) return 'Desactivado'
  if (programacion.tipo === 'siempre') return 'En todas las revisiones'

  const partes: string[] = []

  if (programacion.semanasDelMes.length > 0) {
    const semanas = [...programacion.semanasDelMes]
      .sort((a, b) => a - b)
      .map((n) => NOMBRES_SEMANA[n - 1] ?? `${n}ª`)
    partes.push(`${semanas.join(', ')} semana del mes`)
  }

  if (programacion.diasSemana.length > 0) {
    const dias = [...programacion.diasSemana]
      .sort((a, b) => a - b)
      .map((n) => NOMBRES_DIA[n - 1] ?? String(n))
    partes.push(dias.join(', '))
  }

  if (programacion.meses.length > 0) {
    const meses = [...programacion.meses]
      .sort((a, b) => a - b)
      .map((n) => NOMBRES_MES[n - 1] ?? String(n))
    partes.push(`sólo ${meses.join(', ')}`)
  }

  if (programacion.vigenteDesde || programacion.vigenteHasta) {
    const desde = programacion.vigenteDesde
      ? dayjs(programacion.vigenteDesde).format('DD MMM YYYY')
      : null
    const hasta = programacion.vigenteHasta
      ? dayjs(programacion.vigenteHasta).format('DD MMM YYYY')
      : null
    if (desde && hasta) partes.push(`del ${desde} al ${hasta}`)
    else if (desde) partes.push(`desde el ${desde}`)
    else if (hasta) partes.push(`hasta el ${hasta}`)
  }

  return partes.length > 0 ? partes.join(' · ') : 'En todas las revisiones'
}

/**
 * Próximas fechas en las que el módulo aparecerá. Sirve para que el
 * supervisor confirme que la regla hace lo que cree antes de guardarla.
 */
export const proximasFechas = (
  programacion: ProgramacionModulo,
  cantidad = 4,
  desde: Dayjs = dayjs()
): string[] => {
  if (!programacion.activo) return []
  if (programacion.tipo === 'siempre') return []

  const encontradas: string[] = []
  let cursor = desde.startOf('day')
  // Un año por delante es margen de sobra para cualquier regla mensual
  for (let i = 0; i < 400 && encontradas.length < cantidad; i += 1) {
    if (moduloAplicaEn(programacion, cursor).aplica) {
      encontradas.push(cursor.format('YYYY-MM-DD'))
    }
    cursor = cursor.add(1, 'day')
  }
  return encontradas
}

/** Fila tal como la devuelve Supabase */
export interface FilaModuloConfig {
  clave: string
  activo: boolean
  tipo: string
  semanas_mes: number[] | null
  dias_semana: number[] | null
  meses: number[] | null
  vigente_desde: string | null
  vigente_hasta: string | null
  orden: number | null
}

export const desdeFila = (fila: FilaModuloConfig): ProgramacionModulo => ({
  clave: fila.clave as ModuloClave,
  activo: fila.activo,
  tipo: fila.tipo === 'programado' ? 'programado' : 'siempre',
  semanasDelMes: fila.semanas_mes ?? [],
  diasSemana: fila.dias_semana ?? [],
  meses: fila.meses ?? [],
  vigenteDesde: fila.vigente_desde,
  vigenteHasta: fila.vigente_hasta,
  orden: fila.orden ?? 0,
})

export const haciaFila = (programacion: ProgramacionModulo) => ({
  clave: programacion.clave,
  activo: programacion.activo,
  tipo: programacion.tipo,
  semanas_mes: programacion.semanasDelMes,
  dias_semana: programacion.diasSemana,
  meses: programacion.meses,
  vigente_desde: programacion.vigenteDesde,
  vigente_hasta: programacion.vigenteHasta,
  orden: programacion.orden,
})
