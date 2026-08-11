import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import {
  esErrorDeVersionAntigua,
  marcarVersionCargada,
  recargarConVersionNueva,
  vigilarVersionDesplegada,
} from '@/lib/version-desplegada'

// Antes de nada: si el servidor cambió de versión con la app abierta, los
// trozos que ésta pide ya no existen. Se recarga sola en vez de morir.
vigilarVersionDesplegada()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

const renderBootError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido al iniciar la app'

  root.render(
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <div className="glass-panel-strong w-full max-w-xl rounded-[28px] border-red-300/60 p-6">
        <h1 className="mb-3 text-xl font-bold text-red-700">Error al iniciar la app</h1>
        <p className="mb-2 text-sm text-slate-600">Revisa configuración y consola del navegador.</p>
        <pre className="overflow-auto rounded bg-slate-100 p-3 text-sm text-slate-800">{message}</pre>
      </div>
    </div>
  )
}

import('./App.tsx')
  .then(({ default: App }) => {
    // Arrancó: se cierra el episodio de recargas por versión
    marcarVersionCargada()
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((error) => {
    console.error('Boot error', error)
    // El propio arranque puede pedir un trozo de la versión anterior: ahí no
    // hay nada que mostrar, hay que ir a buscar la nueva
    if (esErrorDeVersionAntigua(error) && recargarConVersionNueva()) return
    renderBootError(error)
  })
