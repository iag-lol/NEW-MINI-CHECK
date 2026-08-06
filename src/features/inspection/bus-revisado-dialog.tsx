import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, MapPin, RotateCcw, Search, UserRound } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { Button } from '@/components/ui/button'
import { ModalPortal } from '@/components/ui/modal-portal'

export interface RevisionPrevia {
  ppu: string
  interno: string
  terminal: string
  /** ISO de la revisión anterior */
  fecha: string
  inspector: string
}

interface BusRevisadoDialogProps {
  revision: RevisionPrevia | null
  onConsultarOtro: () => void
  onVolverARevisar: () => void
}

/** "JUAN CARLOS PÉREZ SOTO" -> "Juan Carlos Pérez" */
const nombreCorto = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map(
      (parte) =>
        parte.charAt(0).toLocaleUpperCase('es') + parte.slice(1).toLocaleLowerCase('es')
    )
    .join(' ')

/**
 * Aviso de que el bus ya se revisó esta semana.
 *
 * Antes era una franja de texto entre el resto del formulario y se leía como
 * un detalle más; la consecuencia era duplicar revisiones del mismo bus
 * mientras otros se quedaban sin ninguna. Aquí ocupa la pantalla y obliga a
 * decidir, porque son dos caminos distintos: casi siempre lo correcto es
 * pasar al siguiente bus, pero a veces hace falta rehacerla.
 */
export const BusRevisadoDialog = ({
  revision,
  onConsultarOtro,
  onVolverARevisar,
}: BusRevisadoDialogProps) => {
  const fecha = revision ? dayjs(revision.fecha) : null

  return (
    <ModalPortal abierto={Boolean(revision)}>
      <AnimatePresence>
        {revision && fecha && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-bus-revisado"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="glass-panel-strong w-full max-w-md overflow-hidden rounded-[var(--app-radius)] border border-white/60 shadow-2xl dark:border-white/10"
            >
              {/* Cabecera ámbar: no es un error, es un aviso que exige decidir */}
              <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-4 text-white">
                <div
                  aria-hidden
                  className="absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/10"
                />
                <div className="relative flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/20 text-2xl backdrop-blur-sm">
                    🚌
                  </span>
                  <div className="min-w-0">
                    <p
                      id="titulo-bus-revisado"
                      className="text-[15px] font-black leading-tight"
                    >
                      Este bus ya fue revisado
                    </p>
                    <p className="text-[12px] text-white/85">
                      Tiene una inspección registrada esta semana
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-5">
                {/* Identidad del bus, grande: es lo que se comprueba de un vistazo */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    {revision.ppu}
                  </span>
                  <span className="text-sm font-bold text-slate-400">
                    #{revision.interno}
                  </span>
                </div>

                <div className="space-y-2 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/50 p-3 dark:border-white/[0.06] dark:bg-white/[0.035]">
                  <div className="flex items-start gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Cuándo
                      </p>
                      <p className="text-[13px] font-semibold capitalize text-slate-800 dark:text-slate-100">
                        {fecha.format('dddd D [de] MMMM · HH:mm')} hrs
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {fecha.fromNow()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Quién
                      </p>
                      <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        {nombreCorto(revision.inspector)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Dónde
                      </p>
                      <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        Terminal {revision.terminal}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
                  Si vuelves a revisarlo se guardará una inspección nueva; la anterior
                  se conserva en el historial.
                </p>

                <div className="flex flex-col gap-2 pt-0.5 sm:flex-row">
                  <Button onClick={onConsultarOtro} className="flex-1 gap-2">
                    <Search className="h-4 w-4" />
                    Consultar otro bus
                  </Button>
                  <Button variant="outline" onClick={onVolverARevisar} className="flex-1 gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Volver a revisar
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  )
}
