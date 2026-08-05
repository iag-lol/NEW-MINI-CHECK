import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    data-ui="card"
    className={cn(
      'glass-panel relative rounded-[var(--app-radius)] p-4 text-slate-800 dark:text-slate-100 sm:p-6',
      className
    )}
    {...props}
  />
)

export const CardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn('text-base font-bold tracking-[-0.02em] text-slate-950 dark:text-white', className)}
    {...props}
  />
)

export const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn('text-sm leading-relaxed text-slate-500 dark:text-slate-400', className)}
    {...props}
  />
)
