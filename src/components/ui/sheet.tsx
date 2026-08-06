import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
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

/** Arrastre mínimo (px) o velocidad (px/s) que cierran la hoja */
const UMBRAL_CIERRE_PX = 100
const UMBRAL_VELOCIDAD = 500

/**
 * Panel contextual.
 *
 * En móvil se comporta como una hoja inferior (el gesto natural del pulgar:
 * el contenido nace donde está la mano, no en el borde opuesto de la
 * pantalla). A partir de tablet vuelve a ser un panel lateral.
 *
 * La hoja se cierra deslizándola hacia abajo desde su cabecera, como
 * cualquier hoja del sistema. Antes el único cierre real era tocar fuera: el
 * tirador era una barra de 4 px de alto y, aunque fuese un botón, acertarle
 * con el pulgar resultaba casi imposible. Ahora toda la cabecera arrastra y
 * el tirador sigue funcionando como botón para quien prefiera tocar.
 */
export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const cerrarRef = useRef<HTMLButtonElement>(null)
  const y = useMotionValue(0)
  // La hoja se atenúa según se arrastra: confirma que el gesto está
  // haciendo algo antes de soltarla.
  const opacidad = useTransform(y, [0, 320], [1, 0.5])

  const alSoltar = (_evento: unknown, info: PanInfo) => {
    if (info.offset.y > UMBRAL_CIERRE_PX || info.velocity.y > UMBRAL_VELOCIDAD) {
      cerrarRef.current?.click()
      return
    }
    // No llegó al umbral: vuelve a su sitio
    y.set(0)
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'glass-panel-strong fixed z-50 flex flex-col overflow-hidden shadow-2xl',
          // Móvil: hoja inferior. El alto máximo descuenta la zona segura
          // superior para que la cabecera no quede bajo el reloj ni la isla
          // dinámica cuando el contenido es largo.
          'inset-x-0 bottom-0 max-h-[calc(92dvh-env(safe-area-inset-top))] rounded-t-[26px]',
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

        {/* Cierre programático que dispara el gesto de arrastre */}
        <SheetClose ref={cerrarRef} className="hidden" aria-hidden tabIndex={-1} />

        {/* Cabecera arrastrable. `touch-none` es imprescindible: sin él, el
            navegador se queda el gesto vertical para hacer scroll y el
            arrastre nunca llega a framer-motion. */}
        <motion.div
          drag="y"
          dragDirectionLock
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.7 }}
          style={{ y, opacity: opacidad }}
          onDragEnd={alSoltar}
          className="flex touch-none select-none items-center justify-center py-3.5 sm:hidden"
        >
          <SheetClose
            aria-label="Cerrar panel"
            className="h-1.5 w-11 rounded-full bg-slate-400/50 transition active:bg-slate-400/80"
          />
        </motion.div>

        <div className="hidden items-center justify-end p-2.5 sm:flex sm:p-3">
          <SheetClose
            aria-label="Cerrar panel"
            className="rounded-full border border-transparent p-1.5 text-slate-500 transition hover:border-white/60 hover:bg-white/60 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </SheetClose>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-5 sm:pb-8 sm:pt-0">
          {children}
        </div>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
})

SheetContent.displayName = DialogPrimitive.Content.displayName
