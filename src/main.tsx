import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

const renderBootError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido al iniciar la app'

  root.render(
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-xl rounded-xl border border-red-300 bg-white p-6 shadow-lg">
        <h1 className="mb-3 text-xl font-bold text-red-700">Error al iniciar la app</h1>
        <p className="mb-2 text-sm text-slate-600">Revisa configuración y consola del navegador.</p>
        <pre className="overflow-auto rounded bg-slate-100 p-3 text-sm text-slate-800">{message}</pre>
      </div>
    </div>
  )
}

import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((error) => {
    console.error('Boot error', error)
    renderBootError(error)
  })
