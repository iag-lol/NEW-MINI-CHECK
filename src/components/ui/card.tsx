import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/80',
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
    className={cn('text-base font-semibold text-slate-900 dark:text-white', className)}
    {...props}
  />
)

export const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn('text-sm text-slate-500 dark:text-slate-400', className)}
    {...props}
  />
)
