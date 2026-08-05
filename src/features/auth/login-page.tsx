import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/auth-store'
import { formatRut } from '@/lib/rut'

const platformFeatures = [
  {
    icon: Radio,
    title: 'Operación en tiempo real',
    description: 'Visibilidad continua de inspecciones, flota y equipos.',
  },
  {
    icon: Activity,
    title: 'Control centralizado',
    description: 'Indicadores y reportes ejecutivos en una sola plataforma.',
  },
  {
    icon: ShieldCheck,
    title: 'Trazabilidad completa',
    description: 'Cada revisión queda asociada a su responsable y terminal.',
  },
]

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, loading, error, lastVisitedPath } = useAuthStore()
  const [rut, setRut] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
    <main className="relative grid min-h-[100dvh] overflow-hidden bg-[#07101f] p-3 sm:p-5 lg:grid-cols-[1.08fr_0.92fr]">
      <div aria-hidden="true" className="absolute -left-36 -top-52 h-[40rem] w-[40rem] rounded-full bg-brand-500/25 blur-[120px]" />
      <div aria-hidden="true" className="absolute -bottom-64 left-1/3 h-[42rem] w-[42rem] rounded-full bg-violet-600/20 blur-[130px]" />
      <div aria-hidden="true" className="absolute -right-64 top-16 h-[34rem] w-[34rem] rounded-full bg-sky-500/15 blur-[120px]" />

      <section className="relative hidden min-h-[calc(100dvh-2.5rem)] overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.045] p-10 shadow-2xl backdrop-blur-2xl lg:flex lg:flex-col xl:p-14">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />

        <div className="relative flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-[17px] border border-white/20 bg-gradient-to-br from-brand-400 to-violet-600 text-white shadow-[0_16px_36px_-14px_var(--color-brand-500)]">
            <ShieldCheck className="h-6 w-6" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#10192a] bg-emerald-400" />
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-[-0.035em] text-white">Mini-Check</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Operations Platform
            </p>
          </div>
        </div>

        <div className="relative my-auto max-w-2xl py-14">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.9)]" />
            Plataforma operacional activa
          </div>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.06] tracking-[-0.055em] text-white xl:text-6xl">
            Control operacional con una visión clara.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300/80 xl:text-lg">
            Inspecciones, trazabilidad y decisiones en tiempo real para una operación de transporte más segura y eficiente.
          </p>

          <div className="mt-10 grid gap-3 xl:grid-cols-3">
            {platformFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl"
                >
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-[13px] bg-white/10 text-brand-300">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <p className="text-sm font-bold text-white">{feature.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-500">
          <span>Mini-Check · Gestión empresarial</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Servicios conectados
          </span>
        </div>
      </section>

      <section className="relative flex min-h-[calc(100dvh-1.5rem)] items-center justify-center px-1 py-6 sm:min-h-[calc(100dvh-2.5rem)] sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <span className="relative flex h-12 w-12 items-center justify-center rounded-[17px] border border-white/20 bg-gradient-to-br from-brand-400 to-violet-600 text-white shadow-xl">
              <ShieldCheck className="h-6 w-6" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#07101f] bg-emerald-400" />
            </span>
            <div>
              <p className="text-lg font-extrabold tracking-[-0.035em] text-white">Mini-Check</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Operations Platform
              </p>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/15 bg-white/[0.085] p-5 shadow-[0_36px_100px_-36px_rgba(0,0,0,.8)] backdrop-blur-2xl sm:p-8">
            <div className="mb-7">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[15px] border border-white/10 bg-white/[0.08] text-brand-300">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.04em] text-white sm:text-3xl">
                Bienvenido
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Ingresa tus credenciales para acceder al centro de operaciones.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="rut" className="text-xs font-semibold text-slate-300">
                  RUT
                </Label>
                <Input
                  id="rut"
                  value={rut}
                  onChange={(event) => setRut(formatRut(event.target.value))}
                  placeholder="12.345.678-9"
                  inputMode="text"
                  autoComplete="username"
                  autoFocus
                  required
                  className="login-control h-12 text-white placeholder:text-slate-500 focus-visible:border-brand-400/70"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-300">
                  Contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Ingresa tu contraseña"
                    autoComplete="current-password"
                    required
                    className="login-control h-12 pr-12 text-white placeholder:text-slate-500 focus-visible:border-brand-400/70"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-12 w-full gap-2 rounded-[15px] text-base"
                disabled={loading || !rut || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando acceso...
                  </>
                ) : (
                  'Ingresar a la plataforma'
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-white/10 pt-5 text-[11px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
              Acceso exclusivo para personal autorizado
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-600">
            Desarrollado para operaciones de alta exigencia
          </p>
        </div>
      </section>
    </main>
  )
}
