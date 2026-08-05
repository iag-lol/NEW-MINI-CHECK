/*
 * Service worker de Mini-Check.
 *
 * Su única responsabilidad es las notificaciones del sistema:
 *  - En Android/Chrome `new Notification()` está prohibido; la única vía es
 *    `registration.showNotification()`, que se invoca desde la página pero
 *    necesita este worker registrado.
 *  - `notificationclick` enfoca la pestaña abierta o abre la app en la ruta
 *    asociada al evento.
 *
 * A propósito NO cachea la aplicación: es una app de datos en vivo y una caché
 * agresiva dejaría a los inspectores viendo builds antiguos.
 */

const VERSION = 'mini-check-sw-v1'

self.addEventListener('install', () => {
  // Activar de inmediato: no hay caché que migrar.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpiar cachés de versiones anteriores por si alguna vez se usaron.
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

/** Mostrar notificación pedida por la página (canal message). */
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'SHOW_NOTIFICATION') return

  const { title, options } = data
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = (event.notification.data && event.notification.data.url) || '/app/dashboard'
  const target = new URL(url, self.location.origin).href

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Si la app ya está abierta, enfocarla y navegar por mensaje
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          client.postMessage({ type: 'NOTIFICATION_CLICK', url })
          return
        }
      }

      await self.clients.openWindow(target)
    })()
  )
})
