import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalPortal } from '@/components/ui/modal-portal'

interface AdminConfirmDialogProps {
  abierto: boolean
  titulo: string
  descripcion: string
  /** Etiqueta del campo de la contraseña que se va a asignar, si aplica */
  pedirNueva?: boolean
  procesando?: boolean
  error?: string | null
  onCancelar: () => void
  onConfirmar: (passwordAdmin: string, nueva: string) => void
}

/**
 * Confirmación de una operación sobre credenciales ajenas.
 *
 * El servidor exige la contraseña del administrador en cada alta o reseteo,
 * porque la aplicación no usa Supabase Auth y la base de datos no tiene otra
 * forma de saber quién está llamando. Antes esto se pedía con `prompt()` del
 * navegador: no se puede estilar, no oculta lo que se escribe y en móvil
 * aparece como una alerta del sistema en mitad de la app.
 */
export const AdminConfirmDialog = ({
  abierto,
  titulo,
  descripcion,
  pedirNueva = false,
  procesando = false,
  error,
  onCancelar,
  onConfirmar,
}: AdminConfirmDialogProps) => {
  const [passwordAdmin, setPasswordAdmin] = useState('')
  const [nueva, setNueva] = useState('')

  // Las contraseñas no se quedan en memoria entre aperturas
  useEffect(() => {
    if (!abierto) {
      setPasswordAdmin('')
      setNueva('')
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto, onCancelar])

  const puedeConfirmar =
    passwordAdmin.length > 0 && (!pedirNueva || nueva.length >= 8) && !procesando

  return (
    <ModalPortal abierto={abierto}>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-admin"
          >
            <motion.form
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onSubmit={(evento) => {
                evento.preventDefault()
                if (puedeConfirmar) onConfirmar(passwordAdmin, nueva)
              }}
              className="glass-panel-strong relative w-full max-w-sm overflow-hidden rounded-[var(--app-radius)] border border-white/60 p-5 shadow-2xl dark:border-white/10"
            >
              <button
                type="button"
                onClick={onCancelar}
                aria-label="Cerrar"
                className="absolute right-2 top-2 rounded-full p-1.5 text-slate-400 transition hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-3 pr-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p
                    id="titulo-admin"
                    className="text-[15px] font-extrabold leading-tight text-slate-900 dark:text-white"
                  >
                    {titulo}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-slate-600 dark:text-slate-300">
                    {descripcion}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {pedirNueva && (
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-nueva">Nueva contraseña</Label>
                    <Input
                      id="admin-nueva"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      value={nueva}
                      onChange={(evento) => setNueva(evento.target.value)}
                    />
                    {nueva.length > 0 && nueva.length < 8 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Faltan {8 - nueva.length} caracteres.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="admin-password" className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    Tu contraseña de administrador
                  </Label>
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder="Para confirmar que eres tú"
                    value={passwordAdmin}
                    onChange={(evento) => setPasswordAdmin(evento.target.value)}
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-[var(--app-radius-sm)] bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-600 dark:text-red-400"
                >
                  {error}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <Button type="submit" className="flex-1 gap-2" disabled={!puedeConfirmar}>
                  {procesando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar
                </Button>
                <Button type="button" variant="outline" onClick={onCancelar}>
                  Cancelar
                </Button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  )
}
