import * as TabsPrimitive from '@radix-ui/react-tabs'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'glass-control inline-flex min-h-10 max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-[var(--app-radius-sm)] border p-1 text-slate-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-h-11 sm:gap-1',
      className
    )}
    {...props}
  />
))

TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex min-w-[80px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--app-radius-sm)-4px)] px-2.5 py-1.5 text-[12px] font-bold transition active:scale-[0.97] data-[state=active]:bg-white/90 data-[state=active]:text-slate-950 data-[state=active]:shadow-[0_5px_16px_-10px_rgba(15,23,42,.5)] dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white sm:min-w-[112px] sm:px-4 sm:py-2 sm:text-sm',
      className
    )}
    {...props}
  />
))

TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-3 focus-visible:outline-none sm:mt-5', className)}
    {...props}
  />
))

TabsContent.displayName = TabsPrimitive.Content.displayName
