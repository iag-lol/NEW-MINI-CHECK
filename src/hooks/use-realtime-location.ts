import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { getUserIP } from '@/lib/ip-utils'

interface LocationData {
  lat: number
  lon: number
  accuracy: number
}

interface UseRealtimeLocationOptions {
  enabled?: boolean
  intervalMs?: number
  highAccuracy?: boolean
}

/**
 * Hook para trackear la ubicación del usuario en tiempo real
 * Envía heartbeat a la BD cada X segundos con la posición GPS actual
 */
export function useRealtimeLocation(options: UseRealtimeLocationOptions = {}) {
  const {
    enabled = true,
    intervalMs = 10000, // 10 segundos por defecto
    highAccuracy = true,
  } = options

  const user = useAuthStore((state) => state.user)
  const [location, setLocation] = useState<LocationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<number | null>(null)
  const lastUpdateRef = useRef<number>(0)

  // Obtener ubicación actual
  const getCurrentLocation = (): Promise<LocationData> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        (error) => {
          reject(error)
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 10000,
          maximumAge: 5000,
        }
      )
    })
  }

  // Enviar heartbeat a la BD
  const sendHeartbeat = async (locationData: LocationData) => {
    if (!user) return

    try {
      const ip = await getUserIP()

      // Usar UPSERT directamente en la tabla
      const { error } = await supabase
        .from('usuarios_activos')
        .upsert({
          usuario_rut: user.rut,
          nombre: user.nombre,
          cargo: user.cargo,
          terminal: user.terminal,
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
        }, {
          onConflict: 'usuario_rut'
        })

      if (error) {
        console.error('Error sending heartbeat:', error)
        setError(error.message)
      } else {
        setError(null)
        lastUpdateRef.current = Date.now()
      }
    } catch (err) {
      console.error('Error in sendHeartbeat:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    }
  }

  // Iniciar tracking
  const startTracking = async () => {
    if (!enabled || !user) return

    try {
      setIsTracking(true)
      setError(null)

      // Obtener ubicación inicial
      const initialLocation = await getCurrentLocation()
      setLocation(initialLocation)
      await sendHeartbeat(initialLocation)

      // Configurar watch para actualizaciones continuas
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          async (position) => {
            const newLocation = {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }
            setLocation(newLocation)

            // Solo enviar heartbeat si han pasado suficientes segundos
            const timeSinceLastUpdate = Date.now() - lastUpdateRef.current
            if (timeSinceLastUpdate >= intervalMs - 1000) {
              await sendHeartbeat(newLocation)
            }
          },
          (error) => {
            console.error('Error watching location:', error)
            setError(error.message)
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: 10000,
            maximumAge: 5000,
          }
        )
      }

      // Configurar intervalo de heartbeat de respaldo
      heartbeatIntervalRef.current = window.setInterval(async () => {
        if (location) {
          await sendHeartbeat(location)
        } else {
          try {
            const currentLocation = await getCurrentLocation()
            setLocation(currentLocation)
            await sendHeartbeat(currentLocation)
          } catch (err) {
            console.error('Error getting location in interval:', err)
          }
        }
      }, intervalMs)

    } catch (err) {
      console.error('Error starting tracking:', err)
      setError(err instanceof Error ? err.message : 'Error al iniciar tracking')
      setIsTracking(false)
    }
  }

  // Detener tracking
  const stopTracking = async () => {
    setIsTracking(false)

    // Limpiar watch de geolocalización
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    // Limpiar intervalo de heartbeat
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    // Eliminar usuario de la tabla de activos
    if (user) {
      try {
        await supabase
          .from('usuarios_activos')
          .delete()
          .eq('usuario_rut', user.rut)
      } catch (err) {
        console.error('Error removing user from active users:', err)
      }
    }
  }

  // Efecto principal
  useEffect(() => {
    if (enabled && user) {
      startTracking()
    }

    return () => {
      stopTracking()
    }
  }, [enabled, user])

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current)
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return {
    location,
    error,
    isTracking,
    startTracking,
    stopTracking,
  }
}
