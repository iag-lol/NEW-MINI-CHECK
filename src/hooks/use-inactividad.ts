import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import {
  AVISO_MS,
  EVENTOS_ACTIVIDAD,
  marcarActividad,
  msRestantes,
} from '@/lib/sesion'

/** Cada cuánto se comprueba el reloj. No hace falta más fino: el diálogo
 *  de aviso lleva su propia cuenta atrás al segundo. */
const TICK_MS = 5_000

/**
 * Cierre automático de sesión por inactividad.
 *
 * No cierra en seco: un minuto antes levanta un aviso con cuenta atrás. Cerrar
 * sin avisar a alguien que lleva veinte campos rellenados de una inspección es
 * perder su trabajo, y la próxima vez no usa la app.
 *
 * El reloj es la marca compartida en localStorage, no un temporizador propio:
 * así una pestaña activa mantiene viva la sesión de las demás, y ninguna
 * pestaña olvidada la mantiene viva ella sola.
 */
export const useInactividad = () => {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const [avisando, setAvisando] = useState(false)
  const [restanteMs, setRestanteMs] = useState(AVISO_MS)
  // Evita que dos ticks seguidos disparen dos cierres
  const cerrandoRef = useRef(false)
  // El listener de actividad se registra una sola vez y necesita saber si el
  // aviso está en pantalla: un estado leído desde el closure se quedaría
  // congelado en su valor inicial.
  const avisandoRef = useRef(false)

  const seguirConectado = useCallback(() => {
    marcarActividad(true)
    avisandoRef.current = false
    setAvisando(false)
  }, [])

  const cerrarAhora = useCallback(() => {
    if (cerrandoRef.current) return
    cerrandoRef.current = true
    setAvisando(false)
    void logout('inactividad')
  }, [logout])

  useEffect(() => {
    if (!user) {
      setAvisando(false)
      avisandoRef.current = false
      cerrandoRef.current = false
      return
    }

    // Entrar a la app ya cuenta como actividad
    marcarActividad(true)

    const registrar = () => {
      // Con el aviso en pantalla la sesión NO se reanuda sola. Rozar el ratón
      // o que el móvil registre un scroll por inercia no es una decisión de
      // nadie, y dejar que eso cancele el cierre vacía de sentido el aviso:
      // para seguir hay que pulsar "Seguir conectado".
      if (cerrandoRef.current || avisandoRef.current) return
      marcarActividad()
    }

    EVENTOS_ACTIVIDAD.forEach((evento) =>
      window.addEventListener(evento, registrar, { passive: true })
    )

    const revisar = () => {
      const restante = msRestantes()
      if (restante <= 0) {
        cerrarAhora()
        return
      }
      const enAviso = restante <= AVISO_MS
      avisandoRef.current = enAviso
      if (enAviso) setRestanteMs(restante)
      setAvisando(enAviso)
    }

    revisar()
    const intervalo = window.setInterval(revisar, TICK_MS)

    // Al volver de segundo plano hay que revisar de inmediato: los
    // temporizadores de una pestaña oculta se ralentizan y el móvil puede
    // haber estado bloqueado media hora sin que corriera un solo tick.
    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', revisar)

    return () => {
      EVENTOS_ACTIVIDAD.forEach((evento) =>
        window.removeEventListener(evento, registrar)
      )
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', revisar)
    }
  }, [user, cerrarAhora])

  return { avisando, restanteMs, seguirConectado, cerrarAhora }
}
