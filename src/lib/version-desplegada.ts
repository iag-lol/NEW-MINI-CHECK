/**
 * Recuperación automática cuando el servidor cambia de versión bajo los pies.
 *
 * La app se divide en trozos con el hash del contenido en el nombre
 * (`login-page-YMRXX4KV.js`). Cada despliegue genera hashes nuevos y borra los
 * anteriores. Quien tenía la app abierta —o la tiene instalada, que es lo
 * habitual aquí— conserva en memoria el `index.html` viejo, que sigue pidiendo
 * los trozos que ya no existen. Al navegar a una pantalla que aún no había
 * cargado, el navegador se encuentra un 404 y la app muere con:
 *
 *   Failed to fetch dynamically imported module: .../assets/login-page-XXXX.js
 *
 * No es un fallo del código: es la versión anterior pidiendo piezas de sí
 * misma que ya no están. La única salida correcta es recargar para tomar el
 * `index.html` nuevo, y eso es lo que hace este módulo, sin que el inspector
 * tenga que entender nada.
 *
 * La revisión a medias no corre peligro: vive en `localStorage` y se recupera
 * al volver a entrar.
 */

const CLAVE_INTENTOS = 'nmcheck-recarga-version'

/** Dos recargas seguidas en menos de esto se consideran el mismo episodio */
const VENTANA_MS = 30_000

interface Intento {
  en: number
  veces: number
}

const leerIntento = (): Intento => {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_INTENTOS)
    if (!crudo) return { en: 0, veces: 0 }
    const dato = JSON.parse(crudo) as Intento
    // Fuera de la ventana es un episodio nuevo: se empieza a contar de cero
    if (Date.now() - dato.en > VENTANA_MS) return { en: 0, veces: 0 }
    return dato
  } catch {
    return { en: 0, veces: 0 }
  }
}

const guardarIntento = (veces: number) => {
  try {
    window.sessionStorage.setItem(
      CLAVE_INTENTOS,
      JSON.stringify({ en: Date.now(), veces } satisfies Intento)
    )
  } catch {
    // Modo privado: sin memoria de intentos sólo se recarga una vez menos
  }
}

/**
 * ¿Este error es "el trozo que pido ya no existe"?
 *
 * Cada navegador lo redacta distinto y no hay código de error, así que hay que
 * ir por el texto. Se recogen las cuatro redacciones reales: Chrome/Edge,
 * Firefox, Safari y la de Vite cuando falla la precarga.
 */
export const esErrorDeVersionAntigua = (error: unknown): boolean => {
  const mensaje =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : ''
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|'text\/html' is not a valid javascript mime type|expected a javascript(-or-wasm)? module/i.test(
    mensaje
  )
}

/**
 * Vuelve a cargar la app tomando la versión nueva.
 *
 * Escalando, porque no todos los casos se arreglan igual:
 *
 * 1. Una recarga normal basta cuando el `index.html` sólo estaba en memoria.
 * 2. Si vuelve a fallar, el HTML viene de la caché del navegador: se limpian
 *    las cachés, se descarta el service worker y se navega con un parámetro
 *    distinto, que ninguna caché puede tener guardado.
 * 3. A la tercera se deja de insistir: recargar en bucle es peor que un error
 *    honesto en pantalla, porque no deja ni leerlo.
 *
 * Devuelve `false` cuando ya no va a recargar, para que quien llame muestre
 * su propia pantalla de error.
 */
export const recargarConVersionNueva = (): boolean => {
  const { veces } = leerIntento()

  if (veces === 0) {
    guardarIntento(1)
    window.location.reload()
    return true
  }

  if (veces === 1) {
    guardarIntento(2)
    void (async () => {
      try {
        if ('caches' in window) {
          const claves = await caches.keys()
          await Promise.all(claves.map((clave) => caches.delete(clave)))
        }
        if ('serviceWorker' in navigator) {
          const registros = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registros.map((registro) => registro.unregister()))
        }
      } catch (error) {
        console.warn('No se pudieron limpiar las cachés', error)
      } finally {
        // El parámetro obliga a pedir el HTML al servidor: ninguna caché
        // tiene guardada esta dirección exacta
        const url = new URL(window.location.href)
        url.searchParams.set('_v', String(Date.now()))
        window.location.replace(url.toString())
      }
    })()
    return true
  }

  return false
}

/** La app arrancó bien: el episodio de recargas se da por cerrado. */
export const marcarVersionCargada = () => {
  try {
    window.sessionStorage.removeItem(CLAVE_INTENTOS)
  } catch {
    // Sin sessionStorage no hay nada que limpiar
  }
}

/**
 * Engancha la recuperación a los dos sitios por donde asoma este fallo.
 *
 * `vite:preloadError` es el aviso propio de Vite al fallar la precarga de un
 * trozo; `unhandledrejection` recoge el resto de caminos (un `lazy()` que
 * revienta fuera de un límite de error, por ejemplo). Sin el segundo, la
 * pantalla se quedaba en blanco.
 */
export const vigilarVersionDesplegada = () => {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (evento) => {
    // Sin esto Vite relanza el error y la app cae igualmente
    evento.preventDefault()
    console.warn('Trozo de una versión anterior; recargando')
    recargarConVersionNueva()
  })

  window.addEventListener('unhandledrejection', (evento) => {
    if (!esErrorDeVersionAntigua(evento.reason)) return
    evento.preventDefault()
    console.warn('Módulo de una versión anterior; recargando')
    recargarConVersionNueva()
  })
}
