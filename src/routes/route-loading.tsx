import { Loader2, ShieldCheck } from 'lucide-react'

export const RouteLoadingPage = () => (
  <div
    role="status"
    aria-live="polite"
    className="glass-panel flex min-h-[50dvh] items-center justify-center rounded-[var(--app-radius-lg)]"
  >
    <div className="flex flex-col items-center gap-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
        <ShieldCheck className="h-6 w-6" />
        <Loader2 className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin rounded-full bg-white text-brand-500 dark:bg-slate-900" />
      </span>
      Preparando módulo...
    </div>
  </div>
)
