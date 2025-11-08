import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { User } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '@/lib/utils'

export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200/70 bg-slate-100 dark:border-slate-800 dark:bg-slate-900',
      className
    )}
    {...props}
  />
))

Avatar.displayName = AvatarPrimitive.Root.displayName

export const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('h-full w-full object-cover', className)}
    {...props}
  />
))

AvatarImage.displayName = AvatarPrimitive.Image.displayName

export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center bg-slate-200 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      className
    )}
    {...props}
  >
    <User className="h-4 w-4" />
  </AvatarPrimitive.Fallback>
))

AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName
