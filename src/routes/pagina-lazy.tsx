import { lazy, type ComponentType } from 'react'
import {
  esErrorDeVersionAntigua,
  recargarConVersionNueva,
} from '@/lib/version-desplegada'

/**
 * Carga diferida de una pantalla, a prueba de red mala y de despliegues.
 *
 * Cada pantalla viaja en su propio archivo y se descarga la primera vez que se
 * entra en ella. Eso deja dos formas de fallar en terreno, y `lazy()` a secas
 * las trata a las dos igual de mal —tumbando la pantalla con un error
 * técnico—, cuando no se parecen en nada:
 *
 * - **Un parpadeo de red.** Frecuentísimo en el celular dentro de un terminal.
 *   El archivo existe; sólo hay que volver a pedirlo. Un reintento lo resuelve
 *   sin que el inspector se entere.
 * - **Un despliegue nuevo.** El archivo ya no existe: esta copia de la app es
 *   de la versión anterior y pide piezas de sí misma que ya se borraron. Aquí
 *   reintentar no sirve de nada; hay que ir a buscar la versión nueva.
 *
 * Mientras la recarga ocurre, la promesa se deja sin resolver a propósito: así
 * se sigue viendo el "Cargando..." de siempre en lugar de un error que
 * parpadea medio segundo y asusta.
 */
export const cargarConReintento = async <T,>(
  cargar: () => Promise<T>
): Promise<T> => {
  try {
    return await cargar()
  } catch (primerError) {
    if (!esErrorDeVersionAntigua(primerError)) throw primerError

    // Un solo reintento: si fue la red, con esto basta
    try {
      return await cargar()
    } catch (segundoError) {
      // Dos veces seguidas es un despliegue, no un parpadeo
      if (recargarConVersionNueva()) {
        return await new Promise<never>(() => {})
      }
      throw segundoError
    }
  }
}

export const paginaLazy = <T extends ComponentType<Record<string, never>>>(
  cargar: () => Promise<{ default: T }>
) => lazy(() => cargarConReintento(cargar))
