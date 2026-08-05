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
      'fixed inset-0 z-40 bg-slate-900/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'supports-[backdrop-filter]:bg-slate-950/40 supports-[backdrop-filter]:backdrop-blur-[3px]',
      className
    )}
    ref={ref}
    {...props}
  />
))

SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Panel contextual.
 *
 * En móvil se comporta como una hoja inferior (el gesto natural del pulgar:
 * el contenido nace donde está la mano, no en el borde opuesto de la
 * pantalla). A partir de tablet vuelve a ser un panel lateral.
 */
export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'glass-panel-strong fixed z-50 flex flex-col overflow-hidden shadow-2xl',
        // Móvil: hoja inferior
        'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[26px]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        // Tablet en adelante: panel lateral
        'sm:inset-y-3 sm:bottom-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[calc(100%-1.5rem)] sm:max-w-sm sm:rounded-[24px]',
        'sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-right',
        className
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">Panel lateral</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Contenido contextual de la aplicación
      </DialogPrimitive.Description>

      {/* Tirador: señala que la hoja se puede cerrar deslizando/tocando fuera */}
      <div className="flex items-center justify-center pt-2 sm:hidden">
        <SheetClose
          aria-label="Cerrar panel"
          className="h-1 w-9 rounded-full bg-slate-400/40 transition active:bg-slate-400/70"
        />
      </div>

      <div className="hidden items-center justify-end p-2.5 sm:flex sm:p-3">
        <SheetClose
          aria-label="Cerrar panel"
          className="rounded-full border border-transparent p-1.5 text-slate-500 transition hover:border-white/60 hover:bg-white/60 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </SheetClose>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-8 sm:pt-0">
        {children}
      </div>
    </DialogPrimitive.Content>
  </SheetPortal>
))

SheetContent.displayName = DialogPrimitive.Content.displayName
