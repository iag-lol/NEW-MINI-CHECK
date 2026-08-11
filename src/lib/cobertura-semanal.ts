import dayjs from '@/lib/dayjs'
import type { Dayjs } from 'dayjs'
import {
  MODULOS,
  moduloAplicaAlBus,
  type DefinicionModulo,
  type ModuloClave,
} from '@/constants/modulos'
import {
  moduloAplicaEn,
  programacionPorDefecto,
  type ProgramacionModulo,
} from '@/lib/programacion'

/**
 * Regla de cobertura semanal, en un solo lugar.
 *
 * "¿Este bus ya está cubierto esta semana?" se responde en dos pantallas: el
 * aviso de bus ya revisado del formulario y el listado de Pendientes. Cuando
 * cada una llevaba su propia copia de la regla, bastó un cambio para que se
 * contradijeran (el aviso decía "ya revisado" y Pendientes lo listaba). Todo
 * lo que define la regla vive aquí y las dos pantallas lo consumen.
 */

/** Lunes de la semana ISO en curso, como ISO string */
export const inicioSemanaActualISO = () =>
  dayjs().isoWeekday(1).startOf('day').toISOString()

/**
 * Módulos vigentes en ALGÚN día de la semana dada.
 *
 * La vigencia por día vale para armar el formulario de HOY, pero el pendiente
 * es semanal: un módulo programado "sólo los viernes" corresponde a la semana
 * entera aunque hoy sea lunes. Evaluar sólo el día actual hacía que el lunes
 * nadie apareciera pendiente de ese módulo y el viernes toda la flota de
 * golpe; y que el aviso de "ya revisado" y Pendientes discreparan según el
 * día en que se miraba.
 */
export const clavesVigentesEnSemana = (
  porClave: ReadonlyMap<ModuloClave, ProgramacionModulo>,
  inicioSemanaISO: string
): Set<ModuloClave> => {
  const inicio: Dayjs = dayjs(inicioSemanaISO).startOf('day')
  const claves = new Set<ModuloClave>()

  MODULOS.forEach((modulo) => {
    // Estado y Cierre sostienen el formulario: siempre cuentan
    if (modulo.fijo) {
      claves.add(modulo.clave)
      return
    }
    const programacion =
      porClave.get(modulo.clave) ?? programacionPorDefecto(modulo.clave, modulo.orden)
    for (let dia = 0; dia < 7; dia += 1) {
      if (moduloAplicaEn(programacion, inicio.add(dia, 'day')).aplica) {
        claves.add(modulo.clave)
        break
      }
    }
  })

  return claves
}

/**
 * Módulos que se le pueden exigir a un bus concreto.
 *
 * Tres filtros y los tres importan: que el módulo persista en una tabla (sin
 * tabla no hay forma de medirlo), que esté vigente esta semana, y que exista
 * en este bus (Mobileye no está instalado fuera de la flota Volvo y exigirlo
 * dejaba a cada Scania pendiente para siempre). `enPanne` exime además los
 * módulos que necesitan arrancar el bus.
 */
export const modulosExigiblesPara = (
  clavesVigentes: ReadonlySet<ModuloClave>,
  bus: { marca?: string | null },
  opciones?: { enPanne?: boolean }
): DefinicionModulo[] =>
  MODULOS.filter(
    (modulo) =>
      modulo.tabla !== null &&
      clavesVigentes.has(modulo.clave) &&
      moduloAplicaAlBus(modulo.clave, bus) &&
      !(opciones?.enPanne && modulo.requiereBusOperativo)
  )
