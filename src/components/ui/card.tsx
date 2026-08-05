import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    data-ui="card"
    className={cn(
      'glass-panel relative rounded-[var(--app-radius)] p-3.5 text-slate-800 dark:text-slate-100 sm:p-5 lg:p-6',
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
    className={cn(
      'text-[15px] font-bold tracking-[-0.02em] text-slate-950 dark:text-white sm:text-base',
      className
    )}
    {...props}
  />
)

export const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn(
      'text-[12.5px] leading-snug text-slate-500 dark:text-slate-400 sm:text-sm sm:leading-relaxed',
      className
    )}
    {...props}
  />
)

/**
 * Encabezado compacto de sección: rótulo + título a la izquierda, acción a la
 * derecha. Evita que cada página vuelva a inventar su propia cabecera.
 */
export const CardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mb-3 flex items-start justify-between gap-3 sm:mb-4', className)}
    {...props}
  />
)

export const CardEyebrow = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn(
      'text-[9.5px] font-black uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400',
      className
    )}
    {...props}
  />
)
