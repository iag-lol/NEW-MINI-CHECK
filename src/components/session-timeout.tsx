import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModalPortal } from '@/components/ui/modal-portal'
import { useInactividad } from '@/hooks/use-inactividad'
import { AVISO_MS, INACTIVIDAD_MS } from '@/lib/sesion'

const minutos = Math.round(INACTIVIDAD_MS / 60_000)

/**
 * Aviso previo al cierre de sesión por inactividad.
 *
 * Se monta una sola vez dentro de la app. Bloquea la pantalla a propósito: si
 * fuera un aviso lateral pasaría desapercibido y el cierre llegaría igual de
 * por sorpresa, que es justo lo que se quiere evitar.
 */
export const SessionTimeout = () => {
  const { avisando, restanteMs, seguirConectado, cerrarAhora } = useInactividad()
  const [segundos, setSegundos] = useState(() => Math.ceil(restanteMs / 1000))

  useEffect(() => {
    if (!avisando) return
    setSegundos(Math.ceil(restanteMs / 1000))
    // Cuenta atrás propia al segundo: el vigilante late cada cinco y un
    // contador que salta de 60 a 55 se lee como si estuviera roto
    const intervalo = window.setInterval(() => {
      setSegundos((previo) => (previo > 0 ? previo - 1 : 0))
    }, 1000)
    return () => window.clearInterval(intervalo)
  }, [avisando, restanteMs])

  const progreso = Math.max(0, Math.min(1, (segundos * 1000) / AVISO_MS))

  return (
    <ModalPortal abierto={avisando}>
      <AnimatePresence>
        {avisando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-inactividad"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="glass-panel-strong w-full max-w-sm overflow-hidden rounded-[var(--app-radius)] border border-white/60 p-5 shadow-2xl dark:border-white/10"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p
                    id="titulo-inactividad"
                    className="text-[15px] font-extrabold leading-tight text-slate-900 dark:text-white"
                  >
                    ¿Sigues ahí?
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-slate-600 dark:text-slate-300">
                    Por seguridad, la sesión se cierra tras {minutos} minutos sin actividad.
                    Se cerrará en{' '}
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {segundos}s
                    </span>
                    .
                  </p>
                </div>
              </div>

              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/70">
                <div
                  className="h-full rounded-full bg-amber-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progreso * 100}%` }}
                />
              </div>

              {/* El texto anterior decía que los datos sin enviar se perdían.
                  Dejó de ser cierto —la revisión a medias se guarda en el
                  teléfono y el reloj ni siquiera corre con un bus abierto— y
                  asustaba sin motivo a quien estaba en terreno. */}
              <p className="mt-3 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Si tenías una revisión a medias, queda guardada en este teléfono: al
                volver a entrar la retomas en el mismo bus y el mismo paso.
              </p>

              <div className="mt-4 flex gap-2">
                <Button onClick={seguirConectado} className="flex-1">
                  Seguir conectado
                </Button>
                <Button variant="outline" onClick={cerrarAhora} className="gap-1.5">
                  <LogOut className="h-4 w-4" />
                  Salir
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  )
}
