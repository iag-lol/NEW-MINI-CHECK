import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export const NotFoundPage = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
    <p className="text-sm font-semibold uppercase tracking-wider text-brand-500">404</p>
    <h2 className="mt-4 text-3xl font-black text-slate-900 dark:text-white">
      Ruta no disponible
    </h2>
    <p className="mt-2 max-w-lg text-slate-500 dark:text-slate-400">
      La ruta que intentas abrir ya no existe o cambió de ubicación. Utiliza la navegación
      lateral para retomar tu trabajo.
    </p>
    <Button asChild className="mt-6">
      <Link to="/app/dashboard">Volver al dashboard</Link>
    </Button>
  </div>
)
