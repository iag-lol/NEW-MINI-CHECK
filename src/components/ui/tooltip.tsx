import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = ({
  className,
  side = 'top',
  align = 'center',
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      sideOffset={8}
      className={cn(
        'z-50 rounded-xl border border-slate-200/70 bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100',
        className
      )}
      side={side}
      align={align}
      {...props}
    />
  </TooltipPrimitive.Portal>
)
