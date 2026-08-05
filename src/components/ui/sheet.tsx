import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export const SheetPortal = DialogPrimitive.Portal

export const SheetOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'supports-[backdrop-filter]:bg-slate-950/45 supports-[backdrop-filter]:backdrop-blur-md',
      className
    )}
    ref={ref}
    {...props}
  />
))

SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'glass-panel-strong fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] max-w-sm flex-col overflow-hidden rounded-[28px] shadow-2xl transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right sm:inset-y-3 sm:right-3',
        className
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">Panel lateral</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Contenido contextual de la aplicación
      </DialogPrimitive.Description>
      <div className="flex items-center justify-end p-3 sm:p-4">
        <SheetClose aria-label="Cerrar panel" className="rounded-full border border-transparent p-2 text-slate-500 transition hover:border-white/60 hover:bg-white/60 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">
          <X className="h-5 w-5" />
        </SheetClose>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10 sm:px-6">{children}</div>
    </DialogPrimitive.Content>
  </SheetPortal>
))

SheetContent.displayName = DialogPrimitive.Content.displayName
