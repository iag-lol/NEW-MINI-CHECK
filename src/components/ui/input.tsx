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
        className={cn(
          'flex h-11 w-full rounded-lg border border-slate-200/60 bg-white/80 px-4 text-sm text-slate-900 transition placeholder:text-slate-400 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:border-slate-800 dark:bg-slate-900/70 dark:text-white',
          error && 'border-red-500 focus-visible:ring-red-500/40',
          className
        )}
        ref={ref}
        {...props}
      />
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
)

Input.displayName = 'Input'
