import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNotificationStore } from '@/store/notification-store'
import { useAuthStore } from '@/store/auth-store'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>
type Ticket = Tables<'tickets'>

/** "JUAN CARLOS PÉREZ SOTO" -> "Juan Carlos Pérez" (dos primeros nombres) */
const nombreCorto = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((parte) =>
      parte.charAt(0).toLocaleUpperCase('es') + parte.slice(1).toLocaleLowerCase('es')
    )
    .join(' ')

/**
 * Suscripciones en tiempo real de toda la app.
 *
 * Los supervisores y jefes de terminal reciben una notificación del sistema
 * por cada bus revisado; los inspectores sólo ven el refresco de datos.
 */
export const useRealtimeSubscriptions = () => {
  const push = useNotificationStore((state) => state.push)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const esSupervisor = user.cargo === 'SUPERVISOR' || user.cargo === 'JEFE DE TERMINAL'

    const revisionsChannel = supabase
      .channel('realtime:revisiones')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'revisiones' },
        (payload) => {
          const revision = payload.new as Revision

          // Los listados de revisiones dejan de estar al día en cuanto entra una
          queryClient.invalidateQueries({ queryKey: ['revisiones'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          queryClient.invalidateQueries({ queryKey: ['mis-revisiones'] })

          if (!esSupervisor) return
          // No avisar al supervisor de su propia inspección
          if (revision.inspector_rut === user.rut) return

          const inspector = nombreCorto(revision.inspector_nombre)
          const terminal = revision.terminal_reportado || revision.terminal_detectado
          const interno = revision.bus_interno ? ` (N° ${revision.bus_interno})` : ''
          const enPanne = revision.estado_bus === 'EN_PANNE'

          push({
            id: revision.id,
            type: enPanne ? 'warning' : 'success',
            title: enPanne
              ? `Bus en panne · ${revision.bus_ppu}`
              : `${inspector} revisó un bus`,
            body: `${inspector} ha revisado el bus ${revision.bus_ppu}${interno} en el Terminal ${terminal}${
              enPanne ? ' · Quedó EN PANNE' : ''
            }`,
            url: '/app/registros',
            tag: 'revision',
            metadata: {
              ppu: revision.bus_ppu,
              terminal,
              inspector: revision.inspector_nombre,
              estado: revision.estado_bus,
            },
          })
        }
      )
      .subscribe()

    const ticketsChannel = supabase
      .channel('realtime:tickets')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          const ticket = payload.new as Ticket
          queryClient.invalidateQueries({ queryKey: ['tickets'] })

          if (!esSupervisor) return

          const descripcion = ticket.descripcion ?? ''
          push({
            id: ticket.id,
            type: 'warning',
            title: `Nuevo ticket · ${ticket.modulo}`,
            body:
              descripcion.length > 90 ? `${descripcion.slice(0, 90)}…` : descripcion,
            url: '/app/tickets',
            tag: 'ticket',
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(revisionsChannel)
      void supabase.removeChannel(ticketsChannel)
    }
  }, [push, queryClient, user])
}
