/**
 * Vigilancia de la sesión por inactividad.
 *
 * La marca de tiempo vive en `localStorage` y no en memoria por dos razones:
 *
 * 1. Se comparte entre pestañas. Con el reloj en memoria, tener el dashboard
 *    abierto en una pestaña olvidada mantenía viva la sesión aunque el
 *    inspector llevara una hora sin tocar nada.
 * 2. Sobrevive a una recarga. Si estuviera sólo en memoria, bastaría con
 *    pulsar F5 para reiniciar el contador y la sesión no caducaría nunca.
 */

/** Diez minutos sin actividad cierran la sesión */
export const INACTIVIDAD_MS = 10 * 60 * 1000

/** Aviso un minuto antes, para no perder un formulario a medio llenar */
export const AVISO_MS = 60 * 1000

/**
 * Cada cuánto se refresca la marca como mucho.
 *
 * Sin este freno, cada `mousemove` escribiría en localStorage: son cientos de
 * escrituras síncronas por minuto y se notan en el desplazamiento.
 */
const REFRESCO_MIN_MS = 5_000

const CLAVE_ACTIVIDAD = 'nmcheck-actividad'

let ultimaEscritura = 0

/** Registra actividad del usuario. Es idempotente y barata de llamar. */
export const marcarActividad = (forzar = false) => {
  const ahora = Date.now()
  if (!forzar && ahora - ultimaEscritura < REFRESCO_MIN_MS) return
  ultimaEscritura = ahora
  try {
    window.localStorage.setItem(CLAVE_ACTIVIDAD, String(ahora))
  } catch {
    // Modo privado o almacenamiento lleno: el contador seguirá en memoria
  }
}

/** Última actividad conocida, o `null` si nunca se registró ninguna. */
export const leerUltimaActividad = (): number | null => {
  try {
    const valor = window.localStorage.getItem(CLAVE_ACTIVIDAD)
    if (!valor) return null
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  } catch {
    return null
  }
}

export const limpiarActividad = () => {
  ultimaEscritura = 0
  try {
    window.localStorage.removeItem(CLAVE_ACTIVIDAD)
  } catch {
    // Nada que limpiar si el almacenamiento no está disponible
  }
}

/** Milisegundos que quedan antes del cierre. Cero o menos: ya caducó. */
export const msRestantes = (): number => {
  const ultima = leerUltimaActividad()
  // Sin marca previa se concede el plazo completo: es el primer render tras
  // el login, no una sesión abandonada.
  if (ultima === null) return INACTIVIDAD_MS
  return ultima + INACTIVIDAD_MS - Date.now()
}

/**
 * ¿La sesión guardada está caducada?
 *
 * Se consulta al rehidratar el store: si la pestaña se cerró hace media hora,
 * la sesión no debe volver sólo porque el usuario siga en localStorage.
 */
export const sesionCaducada = (): boolean => {
  const ultima = leerUltimaActividad()
  if (ultima === null) return false
  return Date.now() - ultima >= INACTIVIDAD_MS
}

/** Eventos que cuentan como "el usuario sigue ahí" */
export const EVENTOS_ACTIVIDAD = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
] as const
