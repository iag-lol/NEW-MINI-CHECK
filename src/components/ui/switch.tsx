import * as SwitchPrimitives from '@radix-ui/react-switch'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-700',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitives.Root>
))

Switch.displayName = SwitchPrimitives.Root.displayName
