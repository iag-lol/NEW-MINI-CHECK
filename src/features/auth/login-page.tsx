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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 px-4 py-12 text-white md:flex-row md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 shadow-2xl backdrop-blur">
        <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
          <div className="relative hidden flex-col gap-6 border-r border-white/5 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.35),_transparent_60%)] p-10 md:flex">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-200">
              New Mini-Check · Supervisión integral
            </p>
            <h1 className="text-4xl font-black leading-tight">
              Control de flota con trazabilidad total y alertas instantáneas.
            </h1>
            <p className="text-lg text-slate-300">
              Inicia sesión con tu RUT corporativo para revisar buses, levantar tickets y seguir
              las métricas en tiempo real.
            </p>
            <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-sm text-slate-300">Autenticación segura</p>
              <p className="text-lg font-semibold text-white">RUT + contraseña cifrada</p>
              <p className="text-sm text-slate-400">
                Las sesiones se protegen mediante Supabase Auth, políticas RLS y hash bcrypt.
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
            <div className="mb-10 flex flex-col gap-2">
              <div className="flex items-center gap-3 text-brand-400">
                <div className="rounded-full bg-brand-400/10 p-3">
                  <Shield className="h-6 w-6" />
                </div>
                <span className="text-sm font-semibold uppercase tracking-[0.3em]">
                  Acceso autorizado
                </span>
              </div>
              <h2 className="text-3xl font-black text-white">
                Ingresa a New Mini-Check
              </h2>
              <p className="text-slate-300">
                Solo personal acreditado. Usa tu RUT (con guion) y contraseña asignada.
              </p>
            </div>
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
                  aria-label="RUT corporativo"
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
                />
              </div>
              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full rounded-2xl bg-brand-500 py-3 text-base font-semibold"
                disabled={loading}
              >
                {loading ? 'Validando credenciales...' : 'Ingresar'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
