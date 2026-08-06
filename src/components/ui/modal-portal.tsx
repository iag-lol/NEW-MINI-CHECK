import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Capa para diálogos que deben cubrir TODA la aplicación.
 *
 * Un `position: fixed` con z-index alto no basta aquí, por dos motivos que se
 * dan a la vez en este layout:
 *
 * - El contenido de las páginas vive dentro de un contenedor con `relative
 *   z-0`, que abre su propio contexto de apilamiento. Dentro de él, un
 *   z-index de 200 sigue estando por debajo del sidebar, que es hermano del
 *   contenedor con z-30. Por eso el sidebar aparecía encendido sobre el velo.
 * - Varios contenedores usan `backdrop-filter` (las tarjetas de cristal), y
 *   eso convierte al elemento en bloque contenedor de sus descendientes
 *   `fixed`: el diálogo se posicionaba respecto a la tarjeta y no respecto a
 *   la ventana, y la página saltaba al fondo al abrirlo.
 *
 * Colgando el diálogo de `document.body` desaparecen los dos problemas.
 * Además se bloquea el desplazamiento del fondo mientras está abierto, para
 * que no se pueda mover la página por detrás del velo.
 */
export const ModalPortal = ({
  abierto,
  children,
}: {
  abierto: boolean
  children: ReactNode
}) => {
  useEffect(() => {
    if (!abierto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [abierto])

  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
