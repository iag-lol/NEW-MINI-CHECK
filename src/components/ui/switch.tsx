import * as SwitchPrimitives from '@radix-ui/react-switch'
import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-[2.6rem] shrink-0 items-center rounded-full border border-white/30 shadow-inner transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/25 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-500 data-[state=unchecked]:bg-slate-300/80 dark:border-white/10 dark:data-[state=unchecked]:bg-slate-700',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-md transition-transform duration-200 data-[state=checked]:translate-x-[21px] data-[state=unchecked]:translate-x-[2px]" />
  </SwitchPrimitives.Root>
))

Switch.displayName = SwitchPrimitives.Root.displayName
