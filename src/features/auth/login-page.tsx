import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/auth-store'
import { formatRut } from '@/lib/rut'

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, loading, error, lastVisitedPath } = useAuthStore()
  const [rut, setRut] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (user) {
      navigate(
        (location.state as { from?: string } | null)?.from ?? lastVisitedPath ?? '/app/formulario',
        { replace: true }
      )
    }
  }, [user, navigate, location.state, lastVisitedPath])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await login(rut, password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10">
            <Shield className="h-8 w-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">New Mini-Check</h1>
          <p className="mt-2 text-sm text-slate-400">Ingresa con tu RUT y contraseña</p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-8 shadow-2xl backdrop-blur">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="rut" className="text-slate-200">
                RUT
              </Label>
              <Input
                id="rut"
                value={rut}
                onChange={(event) => setRut(formatRut(event.target.value))}
                placeholder="12.345.678-9"
                inputMode="text"
                autoComplete="username"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-200">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-12"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl bg-brand-500 text-base font-semibold hover:bg-brand-600"
              disabled={loading}
            >
              {loading ? 'Validando...' : 'Ingresar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
