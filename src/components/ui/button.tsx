import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-[var(--app-radius-sm)] text-[13px] font-semibold tracking-[-0.01em] transition-[transform,box-shadow,background-color,border-color,color,filter] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.965] sm:text-sm',
  {
    variants: {
      variant: {
        default:
          'border border-white/20 bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-12px_var(--color-brand-600)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_30px_-12px_var(--color-brand-600)] dark:border-white/10',
        success:
          'border border-white/20 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,.9)] hover:-translate-y-0.5 hover:brightness-105',
        outline:
          'glass-control border text-slate-800 shadow-sm hover:-translate-y-0.5 hover:border-brand-300/60 hover:bg-white/80 dark:text-slate-100 dark:hover:border-brand-500/40 dark:hover:bg-slate-800/70',
        subtle:
          'border border-white/40 bg-white/55 text-slate-800 shadow-sm backdrop-blur-xl hover:bg-white/85 dark:border-white/5 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-800',
        ghost:
          'text-slate-600 hover:bg-white/60 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white',
        destructive: 'border border-white/20 bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_10px_24px_-12px_rgba(220,38,38,.9)] hover:-translate-y-0.5 hover:brightness-105',
      },
      size: {
        // Alturas en rem: la raíz reducida en móvil las compacta sola
        default: 'h-11 min-h-11 px-4 sm:px-5',
        sm: 'h-9 min-h-9 px-3 text-[12px] sm:px-4 sm:text-xs',
        lg: 'h-12 min-h-12 px-5 text-[15px] sm:px-6 sm:text-base',
        icon: 'h-10 min-h-10 w-10 p-0',
        'icon-sm': 'h-8 min-h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
