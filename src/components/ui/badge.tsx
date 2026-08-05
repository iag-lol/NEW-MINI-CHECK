import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] backdrop-blur-md',
  {
    variants: {
      variant: {
        default: 'border-brand-200/50 bg-brand-50/75 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/15 dark:text-brand-300',
        success: 'border-emerald-200/60 bg-emerald-50/75 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300',
        warning: 'border-amber-200/60 bg-amber-50/75 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300',
        danger: 'border-red-200/60 bg-red-50/75 text-red-600 dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-300',
        outline: 'border-slate-200/70 bg-white/35 text-slate-600 dark:border-slate-700 dark:bg-white/5 dark:text-slate-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
)
