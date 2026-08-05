import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Pantalla de error de ruta.
 *
 * Sin esto, React Router muestra su mensaje por defecto dirigido a
 * desarrolladores ("Hey developer 👋 ..."), que además el navegador traduce.
 * El ErrorBoundary global de App.tsx no alcanza a capturar estos errores
 * porque React Router los intercepta antes.
 */
export const RouteErrorPage = () => {
  const error = useRouteError()

  const mensaje = isRouteErrorResponse(error)
    ? `${error.status} · ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Error inesperado'

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <div className="glass-panel-strong w-full max-w-lg rounded-[28px] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-red-100 p-3 dark:bg-red-950/50">
            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white sm:text-xl">
              Se interrumpió la pantalla
            </h1>
            <p className="text-sm text-slate-500">Tus datos guardados no se vieron afectados.</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Vuelve a cargar la página para continuar. Si el problema se repite, revisa que el
          traductor automático del navegador esté desactivado para este sitio: al traducir la
          página se altera el contenido y la aplicación deja de responder.
        </p>

        <pre className="mt-3 overflow-auto rounded-xl bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {mensaje}
        </pre>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            className="gap-2 rounded-2xl"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Recargar página
          </Button>
          <Button asChild variant="outline" className="gap-2 rounded-2xl">
            <Link to="/app/formulario">
              <Home className="h-4 w-4" />
              Ir al inicio
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
