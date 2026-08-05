import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNotificationStore } from '@/store/notification-store'
import { useAuthStore } from '@/store/auth-store'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>
type Ticket = Tables<'tickets'>

/** Cada cuánto se comprueban registros nuevos si el canal en vivo no llega */
const SONDEO_MS = 15_000

/** "JUAN CARLOS PÉREZ SOTO" -> "Juan Carlos Pérez" (dos primeros nombres) */
const nombreCorto = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map(
      (parte) =>
        parte.charAt(0).toLocaleUpperCase('es') + parte.slice(1).toLocaleLowerCase('es')
    )
    .join(' ')

/**
 * Suscripciones en tiempo real de toda la app.
 *
 * Hay dos vías hacia la misma notificación y es a propósito:
 *
 * - El canal `postgres_changes` entrega el aviso al instante, pero sólo
 *   funciona si la tabla está incluida en la publicación `supabase_realtime`
 *   del proyecto. Si no lo está, no llega absolutamente nada y desde la app no
 *   hay forma de distinguirlo de "no ha pasado nada".
 * - El sondeo pregunta cada pocos segundos por registros posteriores al último
 *   visto. Es la red de seguridad: puede tardar unos segundos, pero garantiza
 *   que el supervisor se entera aunque la réplica en vivo esté apagada.
 *
 * Las repeticiones no importan: el store descarta cualquier notificación cuyo
 * id ya exista, así que el primero que llegue gana.
 */
export const useRealtimeSubscriptions = () => {
  const push = useNotificationStore((state) => state.push)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  // Marca de agua: sólo se avisa de lo ocurrido después de abrir la sesión,
  // nunca del historial que ya estaba en la base de datos.
  const desdeRevisiones = useRef<string>(new Date().toISOString())
  const desdeTickets = useRef<string>(new Date().toISOString())

  useEffect(() => {
    if (!user) return

    const esSupervisor = user.cargo === 'SUPERVISOR' || user.cargo === 'JEFE DE TERMINAL'

    const refrescarListados = () => {
      queryClient.invalidateQueries({ queryKey: ['revisiones'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['mis-revisiones'] })
      queryClient.invalidateQueries({ queryKey: ['pendientes-revisiones'] })
    }

    const avisarRevision = (revision: Revision) => {
      if (!esSupervisor) return

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

    const avisarTicket = (ticket: Ticket) => {
      if (!esSupervisor) return
      const descripcion = ticket.descripcion ?? ''
      push({
        id: ticket.id,
        type: 'warning',
        title: `Nuevo ticket · ${ticket.modulo}`,
        body: descripcion.length > 90 ? `${descripcion.slice(0, 90)}…` : descripcion,
        url: '/app/tickets',
        tag: 'ticket',
      })
    }

    /* ------------------------------------------------- Canal en vivo */

    const canalRevisiones = supabase
      .channel('realtime:revisiones')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'revisiones' },
        (payload) => {
          const revision = payload.new as Revision
          refrescarListados()
          if (revision.created_at > desdeRevisiones.current) {
            desdeRevisiones.current = revision.created_at
          }
          avisarRevision(revision)
        }
      )
      .subscribe((estado) => {
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
          console.warn(
            `Canal realtime de revisiones en estado "${estado}". ` +
              'El sondeo de respaldo sigue cubriendo las notificaciones.'
          )
        }
      })

    const canalTickets = supabase
      .channel('realtime:tickets')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          const ticket = payload.new as Ticket
          queryClient.invalidateQueries({ queryKey: ['tickets'] })
          if (ticket.created_at > desdeTickets.current) {
            desdeTickets.current = ticket.created_at
          }
          avisarTicket(ticket)
        }
      )
      .subscribe()

    /* ------------------------------------------------ Sondeo de respaldo */

    const sondear = async () => {
      if (!esSupervisor) return
      if (document.visibilityState === 'hidden') return

      const { data: revisiones, error: errorRevisiones } = await supabase
        .from('revisiones')
        .select('*')
        .gt('created_at', desdeRevisiones.current)
        .order('created_at', { ascending: true })
        .limit(15)

      if (errorRevisiones) {
        console.warn('No se pudieron consultar revisiones nuevas', errorRevisiones)
      } else if (revisiones?.length) {
        const nuevas = revisiones as unknown as Revision[]
        desdeRevisiones.current = nuevas[nuevas.length - 1].created_at
        refrescarListados()
        nuevas.forEach(avisarRevision)
      }

      const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .gt('created_at', desdeTickets.current)
        .order('created_at', { ascending: true })
        .limit(15)

      if (tickets?.length) {
        const nuevos = tickets as unknown as Ticket[]
        desdeTickets.current = nuevos[nuevos.length - 1].created_at
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        nuevos.forEach(avisarTicket)
      }
    }

    const intervalo = window.setInterval(() => void sondear(), SONDEO_MS)
    // Al volver del segundo plano puede haberse acumulado actividad
    const alVolver = () => {
      if (document.visibilityState === 'visible') void sondear()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      void supabase.removeChannel(canalRevisiones)
      void supabase.removeChannel(canalTickets)
    }
  }, [push, queryClient, user])
}
