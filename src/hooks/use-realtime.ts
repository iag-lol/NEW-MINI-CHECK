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

/**
 * Ventana para agrupar los eventos de un mismo envío.
 *
 * Al enviar una revisión, el formulario inserta la fila de `revisiones` y a
 * continuación un ticket por cada hallazgo. Cada inserción llega como un
 * evento separado, y avisar por evento producía cuatro o cinco alertas del
 * mismo envío. Los tickets se insertan milisegundos después de su revisión,
 * así que unos segundos de espera bastan para juntarlos en un solo aviso.
 */
const VENTANA_AGRUPACION_MS = 4_000

interface EnvioPendiente {
  revision?: Revision
  tickets: Ticket[]
  timer: number
}

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
 * Ambas vías alimentan el mismo buffer de agrupación por revisión, y el store
 * descarta ids repetidos, así que el primero que llegue gana y no hay dobles.
 */
export const useRealtimeSubscriptions = () => {
  const push = useNotificationStore((state) => state.push)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  // Marca de agua: sólo se avisa de lo ocurrido después de abrir la sesión,
  // nunca del historial que ya estaba en la base de datos.
  const desdeRevisiones = useRef<string>(new Date().toISOString())
  const desdeTickets = useRef<string>(new Date().toISOString())

  // Envíos a medio llegar, agrupados por id de revisión
  const pendientesRef = useRef<Map<string, EnvioPendiente>>(new Map())

  useEffect(() => {
    if (!user) return

    const esSupervisor = user.cargo === 'SUPERVISOR' || user.cargo === 'JEFE DE TERMINAL'
    const pendientes = pendientesRef.current

    const refrescarListados = () => {
      queryClient.invalidateQueries({ queryKey: ['revisiones'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['mis-revisiones'] })
      queryClient.invalidateQueries({ queryKey: ['pendientes-revisiones'] })
      // La cobertura por módulo alimenta el listado de pendientes y el corte
      // de "ya revisado": si no se invalida aquí, sólo se refresca por reloj
      queryClient.invalidateQueries({ queryKey: ['pendientes-cobertura'] })
    }

    /** Emite UNA notificación con todo lo acumulado de un envío. */
    const emitir = (revisionId: string) => {
      const entrada = pendientes.get(revisionId)
      if (!entrada) return
      pendientes.delete(revisionId)

      if (!esSupervisor) return

      const { revision, tickets } = entrada
      const modulos = [...new Set(tickets.map((ticket) => ticket.modulo))]

      if (revision) {
        const inspector = nombreCorto(revision.inspector_nombre)
        const terminal = revision.terminal_reportado || revision.terminal_detectado
        const interno = revision.bus_interno ? ` (N° ${revision.bus_interno})` : ''
        const enPanne = revision.estado_bus === 'EN_PANNE'

        const hallazgos =
          tickets.length > 0
            ? ` · ${tickets.length} hallazgo${tickets.length !== 1 ? 's' : ''}: ${modulos.join(', ')}`
            : ''

        push({
          id: revision.id,
          type: enPanne || tickets.length > 0 ? 'warning' : 'success',
          title: enPanne
            ? `Bus en panne · ${revision.bus_ppu}`
            : `${inspector} revisó un bus`,
          body: `${inspector} ha revisado el bus ${revision.bus_ppu}${interno} en el Terminal ${terminal}${
            enPanne ? ' · Quedó EN PANNE' : ''
          }${hallazgos}`,
          url: tickets.length > 0 ? '/app/tickets' : '/app/registros',
          tag: 'revision',
          metadata: {
            ppu: revision.bus_ppu,
            terminal,
            inspector: revision.inspector_nombre,
            estado: revision.estado_bus,
            hallazgos: modulos,
          },
        })
        return
      }

      // Tickets sin revisión a la vista (canal que perdió el evento, o un
      // ticket creado suelto): un único aviso resumido por revisión.
      if (tickets.length > 0) {
        const primero = tickets[0]
        const descripcion = primero.descripcion ?? ''
        push({
          id: `tickets-${revisionId}`,
          type: 'warning',
          title:
            tickets.length === 1
              ? `Nuevo ticket · ${primero.modulo}`
              : `${tickets.length} tickets nuevos · ${primero.terminal}`,
          body:
            tickets.length === 1
              ? descripcion.length > 90
                ? `${descripcion.slice(0, 90)}…`
                : descripcion
              : `Módulos con hallazgos: ${modulos.join(', ')}`,
          url: '/app/tickets',
          tag: 'ticket',
        })
      }
    }

    /** Suma un evento al buffer de su envío; el primero arma el temporizador. */
    const encolar = (
      revisionId: string,
      dato: { revision?: Revision; ticket?: Ticket }
    ) => {
      let entrada = pendientes.get(revisionId)
      if (!entrada) {
        entrada = {
          tickets: [],
          timer: window.setTimeout(() => emitir(revisionId), VENTANA_AGRUPACION_MS),
        }
        pendientes.set(revisionId, entrada)
      }
      if (dato.revision) entrada.revision = dato.revision
      if (dato.ticket) entrada.tickets.push(dato.ticket)
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
          encolar(revision.id, { revision })
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

    // Cambios en el alcance de la revisión: si el supervisor apaga o
    // programa un módulo, TODAS las sesiones abiertas deben enterarse al
    // momento. Sin esto, un formulario abierto seguía pidiendo módulos
    // recién desactivados hasta recargar la página.
    const canalModulos = supabase
      .channel('realtime:modulos_config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'modulos_config' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['modulos-config'] })
          queryClient.invalidateQueries({ queryKey: ['modulos-avance'] })
        }
      )
      .subscribe()

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
          encolar(ticket.revision_id ?? ticket.id, { ticket })
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
        nuevas.forEach((revision) => encolar(revision.id, { revision }))
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
        nuevos.forEach((ticket) => encolar(ticket.revision_id ?? ticket.id, { ticket }))
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
      // Vaciar el buffer sin emitir: la sesión del efecto terminó
      pendientes.forEach((entrada) => window.clearTimeout(entrada.timer))
      pendientes.clear()
      void supabase.removeChannel(canalRevisiones)
      void supabase.removeChannel(canalModulos)
      void supabase.removeChannel(canalTickets)
    }
  }, [push, queryClient, user])
}
