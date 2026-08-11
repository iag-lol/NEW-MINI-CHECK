import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@/providers/theme-provider'
import { router } from '@/router'
import { Component, useEffect, type ReactNode } from 'react'
import { inicializarPWA } from '@/lib/pwa'
import { desbloquearAudio } from '@/lib/sound'
import { useNotificationStore } from '@/store/notification-store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
})

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error capturado:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      /*
       * Lo primero que hay que decir es qué pasa con la revisión.
       *
       * La pantalla anterior mostraba el mensaje técnico y un botón de
       * recargar. En terreno eso se leía como "perdiste lo que llevabas": la
       * gente cerraba la app y volvía a empezar el bus desde cero, aunque el
       * borrador estuviera intacto en el teléfono. El estado del trabajo va
       * arriba y el detalle técnico, plegado, para quien tenga que reportarlo.
       */
      return (
        <div className="flex min-h-[100dvh] items-center justify-center p-4">
          <div className="glass-panel-strong max-w-md rounded-[28px] border-red-200/60 p-6 dark:border-red-500/20">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400">
              Algo salió mal
            </h2>
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              Tu revisión a medias está guardada en este teléfono. Al volver a
              entrar la retomas en el mismo bus y el mismo paso.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400">
                Ver detalle técnico
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {this.state.error?.message || 'Error desconocido'}
              </pre>
            </details>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-white shadow-lg hover:bg-brand-600"
              >
                Recargar y continuar
              </button>
              {/* Salida por si el fallo se repite justo en la pantalla que
                  se recarga: recargar en bucle dejaba la app inservible */}
              <button
                onClick={() => {
                  window.location.href = '/app/formulario'
                }}
                className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Ir al inicio
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Arranque de la integración con el sistema operativo: service worker,
 * instalación como app y desbloqueo del audio de notificaciones (los
 * navegadores exigen un gesto previo del usuario para poder sonar).
 */
const usePlataformaNativa = () => {
  useEffect(() => {
    inicializarPWA((url) => void router.navigate(url))
    useNotificationStore.getState().syncPermiso()

    const desbloquear = () => desbloquearAudio()
    window.addEventListener('pointerdown', desbloquear, { once: true })
    window.addEventListener('keydown', desbloquear, { once: true })
    return () => {
      window.removeEventListener('pointerdown', desbloquear)
      window.removeEventListener('keydown', desbloquear)
    }
  }, [])
}

function App() {
  usePlataformaNativa()

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
