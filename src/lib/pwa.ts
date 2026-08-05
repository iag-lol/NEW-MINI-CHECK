/**
 * Integración con el sistema operativo: instalación de la app,
 * service worker y contador en el icono (badge).
 */

export type Plataforma = 'ios' | 'android' | 'windows' | 'macos' | 'otro'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/** Registro del service worker, compartido por toda la app. */
let swRegistration: ServiceWorkerRegistration | null = null

/** Último evento `beforeinstallprompt` capturado (Chrome/Edge lo emite una vez). */
let deferredPrompt: BeforeInstallPromptEvent | null = null

const listeners = new Set<(disponible: boolean) => void>()

export const detectarPlataforma = (): Plataforma => {
  if (typeof navigator === 'undefined') return 'otro'
  const ua = navigator.userAgent
  const plataforma = navigator.platform || ''

  // iPadOS 13+ se presenta como Macintosh, pero es táctil
  const esTactilMac = plataforma === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || esTactilMac) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Win/i.test(plataforma) || /Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(plataforma) || /Mac OS X/i.test(ua)) return 'macos'
  return 'otro'
}

export const nombrePlataforma = (plataforma: Plataforma) =>
  ({
    ios: 'iPhone / iPad',
    android: 'Android',
    windows: 'Windows',
    macos: 'Mac',
    otro: 'este dispositivo',
  })[plataforma]

/** ¿La app ya se está ejecutando instalada (no en pestaña del navegador)? */
export const estaInstalada = (): boolean => {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone
  return Boolean(standalone || iosStandalone)
}

export const puedeInstalar = () => deferredPrompt !== null

export const onInstallPromptChange = (listener: (disponible: boolean) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const notificar = () => {
  const disponible = deferredPrompt !== null
  listeners.forEach((listener) => listener(disponible))
}

/** Lanza el diálogo nativo de instalación. Devuelve true si el usuario aceptó. */
export const lanzarInstalacion = async (): Promise<boolean> => {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  // El evento sólo se puede consumir una vez
  deferredPrompt = null
  notificar()
  return outcome === 'accepted'
}

export const getServiceWorkerRegistration = () => swRegistration

/**
 * Registra el service worker y engancha los eventos de instalación.
 * Es idempotente: se puede llamar en cada arranque.
 */
export const inicializarPWA = (onNotificationClick?: (url: string) => void) => {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    // Evitar el mini-infobar de Chrome; el prompt lo lanzamos nosotros
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notificar()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notificar()
  })

  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => {
      swRegistration = registration
    })
    .catch((error) => {
      console.warn('No se pudo registrar el service worker', error)
    })

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK' && onNotificationClick) {
      onNotificationClick(event.data.url)
    }
  })
}

/**
 * Contador sobre el icono de la app (dock de macOS, barra de tareas de
 * Windows, icono del launcher en Android). Silencioso donde no exista.
 */
export const actualizarBadge = (cantidad: number) => {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }

  try {
    if (cantidad > 0) {
      void nav.setAppBadge?.(cantidad)
    } else {
      void nav.clearAppBadge?.()
    }
  } catch {
    // Navegadores sin Badging API: no es crítico
  }
}
