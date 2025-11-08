import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <div className="flex flex-col gap-1">
      <textarea
        ref={ref}
        className={cn(
          'min-h-[96px] w-full rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-300 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100',
          error && 'border-red-500 focus-visible:ring-red-400/40',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
)

Textarea.displayName = 'Textarea'
