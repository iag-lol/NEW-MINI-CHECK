import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore, type AuthUser } from '@/store/auth-store'
import { getUserIP } from '@/lib/ip-utils'

export interface TrackingLocation {
  lat: number
  lon: number
  accuracy: number
}

type LocationData = TrackingLocation

export interface TrackingSnapshot {
  location: LocationData | null
  error: string | null
  isTracking: boolean
  lastHeartbeat: number | null
  lastLocationUpdate: number | null
}

interface UseRealtimeLocationOptions {
  enabled?: boolean
  intervalMs?: number
  highAccuracy?: boolean
}

/**
 * Publica la posición del usuario en `usuarios_activos` para el mapa en vivo.
 *
 * Dos decisiones importantes, ambas nacidas del mismo síntoma —inspectores
 * que se desconectaban y reconectaban solos mientras usaban el teléfono:
 *
 * 1. La limpieza del efecto NO borra la fila. Antes sí lo hacía, y el efecto
 *    se reejecutaba cada vez que cambiaba la *identidad* del objeto `user`
 *    (guardar el perfil, subir una foto, rehidratar el store). Cada uno de
 *    esos cambios provocaba DELETE + INSERT, y en el mapa del supervisor eso
 *    se veía como una desconexión. La fila sólo se borra al cerrar sesión;
 *    para todo lo demás basta con que el pulso envejezca.
 *
 * 2. El pulso se reenvía al volver del segundo plano. Los navegadores móviles
 *    congelan `setInterval` y `watchPosition` cuando la pantalla se apaga o
 *    el usuario se va a otra app, así que al regresar el último pulso ya
 *    estaba viejo. Ahora se emite uno de inmediato al recuperar visibilidad,
 *    foco o red.
 */
export function useRealtimeLocation(options: UseRealtimeLocationOptions = {}) {
  const {
    enabled = true,
    intervalMs = 10000,
    highAccuracy = true,
  } = options

  const user = useAuthStore((state) => state.user)
  const rut = user?.rut ?? null

  const [location, setLocation] = useState<LocationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null)
  const [lastLocationUpdate, setLastLocationUpdate] = useState<number | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const lastLocationRef = useRef<LocationData | null>(null)
  const inFlightRef = useRef(false)

  // El perfil se lee por referencia dentro de callbacks estables: así cambiar
  // el nombre o la foto no reinicia el seguimiento.
  const userRef = useRef<AuthUser | null>(user)
  userRef.current = user

  const updateLocationState = useCallback((nextLocation: LocationData) => {
    setLocation(nextLocation)
    lastLocationRef.current = nextLocation
    setLastLocationUpdate(Date.now())
  }, [])

  const getCurrentLocation = useCallback(
    (): Promise<LocationData> =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocalización no soportada'))
          return
        }

        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          (geoError) => {
            let errorMessage = 'Error al obtener ubicación'
            switch (geoError.code) {
              case geoError.PERMISSION_DENIED:
                errorMessage = 'GPS BLOQUEADO por tu navegador.'
                break
              case geoError.POSITION_UNAVAILABLE:
                errorMessage = 'GPS no disponible. Activa la ubicación en tu dispositivo.'
                break
              case geoError.TIMEOUT:
                errorMessage = 'GPS tardó mucho. Intenta de nuevo.'
                break
              default:
                errorMessage = geoError.message || 'Error de GPS'
            }
            reject(Object.assign(new Error(errorMessage), { code: geoError.code }))
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: 10000,
            maximumAge: 5000,
          }
        )
      }),
    [highAccuracy]
  )

  const sendHeartbeat = useCallback(async (locationData: LocationData) => {
    const currentUser = userRef.current
    if (!currentUser) return

    // Un pulso lento (IP + red móvil) no debe encolar otro encima
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      const ip = await getUserIP()

      const { error: upsertError } = await supabase
        .from('usuarios_activos')
        .upsert(
          {
            usuario_rut: currentUser.rut,
            nombre: currentUser.nombre,
            cargo: currentUser.cargo,
            terminal: currentUser.terminal,
            lat: locationData.lat,
            lon: locationData.lon,
            accuracy: locationData.accuracy,
            last_heartbeat: new Date().toISOString(),
            ip_address: ip,
            device_info: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language,
            },
          },
          { onConflict: 'usuario_rut' }
        )

      if (upsertError) {
        console.error('Error enviando el pulso GPS:', upsertError)
        setError(upsertError.message)
      } else {
        setError(null)
        setLastHeartbeat(Date.now())
        lastUpdateRef.current = Date.now()
      }
    } catch (err) {
      console.error('Fallo al enviar el pulso GPS:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      inFlightRef.current = false
    }
  }, [])

  /** Pulso inmediato con la última posición conocida (o una nueva si no hay). */
  const pulseNow = useCallback(async () => {
    const known = lastLocationRef.current
    if (known) {
      await sendHeartbeat(known)
      return
    }
    try {
      const fresh = await getCurrentLocation()
      updateLocationState(fresh)
      await sendHeartbeat(fresh)
    } catch (err) {
      console.error('No se pudo obtener la ubicación para el pulso:', err)
    }
  }, [getCurrentLocation, sendHeartbeat, updateLocationState])

  const detenerSensores = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  const startTracking = useCallback(async () => {
    if (!enabled || !userRef.current) return

    // Evita duplicar watchers si se llama dos veces (StrictMode incluido)
    detenerSensores()

    try {
      setIsTracking(true)
      setError(null)

      const initialLocation = await getCurrentLocation()
      updateLocationState(initialLocation)
      await sendHeartbeat(initialLocation)

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const newLocation = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }
            updateLocationState(newLocation)

            const desdeElUltimo = Date.now() - lastUpdateRef.current
            if (desdeElUltimo >= intervalMs - 1000) {
              void sendHeartbeat(newLocation)
            }
          },
          (geoError) => {
            // El GPS puede fallar puntualmente dentro del terminal; el pulso
            // de respaldo sigue vivo con la última posición conocida.
            console.warn('watchPosition falló:', geoError)
            setError(geoError.message)
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: 10000,
            maximumAge: 5000,
          }
        )
      }

      heartbeatIntervalRef.current = window.setInterval(() => {
        // Con la pestaña oculta el temporizador va a trompicones; el pulso
        // real lo dispara el evento de visibilidad al volver.
        if (document.visibilityState === 'hidden') return
        void pulseNow()
      }, intervalMs)
    } catch (err) {
      console.error('Error iniciando el seguimiento:', err)
      setError(err instanceof Error ? err.message : 'Error al iniciar tracking')
      setIsTracking(false)
    }
  }, [
    detenerSensores,
    enabled,
    getCurrentLocation,
    highAccuracy,
    intervalMs,
    pulseNow,
    sendHeartbeat,
    updateLocationState,
  ])

  /**
   * Retira al usuario del mapa. Sólo debe llamarse en un cierre de sesión
   * explícito: en cualquier otro caso basta con dejar envejecer el pulso.
   */
  const stopTracking = useCallback(async () => {
    setIsTracking(false)
    detenerSensores()
    lastLocationRef.current = null
    setLastHeartbeat(null)
    setLastLocationUpdate(null)

    const currentUser = userRef.current
    if (!currentUser) return

    try {
      await supabase
        .from('usuarios_activos')
        .delete()
        .eq('usuario_rut', currentUser.rut)
    } catch (err) {
      console.error('Error retirando al usuario del mapa:', err)
    }
  }, [detenerSensores])

  // Arranque y parada del seguimiento. La dependencia es el RUT, no el objeto
  // `user`: cambiar el nombre o la foto no debe reiniciar nada.
  useEffect(() => {
    if (!enabled || !rut) {
      detenerSensores()
      return
    }

    void startTracking()

    return () => {
      // Sólo apagamos los sensores: la fila del mapa se conserva.
      detenerSensores()
    }
  }, [enabled, rut, startTracking, detenerSensores])

  // Volver del segundo plano, recuperar el foco o reconectarse a la red son
  // justo los momentos en los que el pulso está más viejo.
  useEffect(() => {
    if (!enabled || !rut) return

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      void pulseNow()
    }

    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    window.addEventListener('online', alVolver)
    window.addEventListener('pageshow', alVolver)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener('online', alVolver)
      window.removeEventListener('pageshow', alVolver)
    }
  }, [enabled, rut, pulseNow])

  const refreshLocation = useCallback(async () => {
    try {
      const latest = await getCurrentLocation()
      updateLocationState(latest)
      if (enabled) await sendHeartbeat(latest)
    } catch (err) {
      console.error('Error actualizando el GPS:', err)
      setError(err instanceof Error ? err.message : 'No pudimos actualizar el GPS')
    }
  }, [enabled, getCurrentLocation, sendHeartbeat, updateLocationState])

  return {
    location,
    error,
    isTracking,
    lastHeartbeat,
    lastLocationUpdate,
    startTracking,
    stopTracking,
    refreshLocation,
  }
}
