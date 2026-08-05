import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      <input
        type={type}
        data-ui="input"
        className={cn(
          'glass-control flex h-11 w-full rounded-xl border px-4 text-sm text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,.65),0_4px_14px_-10px_rgba(15,23,42,.35)] outline-none placeholder:text-slate-400 focus-visible:border-brand-400/70 focus-visible:ring-4 focus-visible:ring-brand-300/20 dark:text-white dark:placeholder:text-slate-500',
          error && 'border-red-500 focus-visible:ring-red-500/40',
          className
        )}
        ref={ref}
        {...props}
      />
      {error && <p role="alert" className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
)

Input.displayName = 'Input'
