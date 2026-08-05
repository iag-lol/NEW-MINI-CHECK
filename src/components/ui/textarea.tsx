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
        data-ui="textarea"
        className={cn(
          'glass-control min-h-[112px] w-full resize-y rounded-2xl border px-4 py-3 text-sm leading-relaxed text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,.65)] outline-none placeholder:text-slate-400 focus:border-brand-400/70 focus-visible:ring-4 focus-visible:ring-brand-300/20 dark:text-slate-100 dark:placeholder:text-slate-500',
          error && 'border-red-500 focus-visible:ring-red-400/40',
          className
        )}
        {...props}
      />
      {error && <p role="alert" className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  )
)

Textarea.displayName = 'Textarea'
