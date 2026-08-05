import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

export interface ChatToast {
  id: string
  nombre: string
  mensaje: string
  foto?: string | null
  cargo?: string
}

interface ChatToastContainerProps {
  toasts: ChatToast[]
  onDismiss: (id: string) => void
}

export function ChatToastContainer({ toasts, onDismiss }: ChatToastContainerProps) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed left-3 right-3 top-24 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[24rem]">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ChatToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

interface ChatToastItemProps {
  toast: ChatToast
  onDismiss: (id: string) => void
}

function ChatToastItem({ toast, onDismiss }: ChatToastItemProps) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const duration = 5000 // 5 segundos
    const interval = 50 // actualizar cada 50ms
    const decrement = (interval / duration) * 100

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer)
          onDismiss(toast.id)
          return 0
        }
        return prev - decrement
      })
    }, interval)

    return () => clearInterval(timer)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      role="status"
      className="glass-panel-strong pointer-events-auto relative overflow-hidden rounded-2xl border-brand-200/60 dark:border-brand-500/20"
    >
      {/* Barra de progreso */}
      <div className="absolute bottom-0 left-0 h-1 bg-brand-500" style={{ width: `${progress}%` }} />

      <div className="flex items-start gap-3 p-4 pr-12">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {toast.foto ? (
            <img
              src={toast.foto}
              alt={toast.nombre}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-500"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white ring-2 ring-brand-500">
              {toast.nombre.charAt(0)}
            </div>
          )}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-500" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {toast.nombre}
            </p>
          </div>
          {toast.cargo && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {toast.cargo}
            </p>
          )}
          <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">
            {toast.mensaje}
          </p>
        </div>

        {/* Botón cerrar */}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="absolute right-2 top-2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Cerrar notificación de chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}
