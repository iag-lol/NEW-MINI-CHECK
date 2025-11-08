import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNotificationStore } from '@/store/notification-store'
import { useAuthStore } from '@/store/auth-store'

export const useRealtimeSubscriptions = () => {
  const { push } = useNotificationStore()
  const { user } = useAuthStore()

  useEffect(() => {
    if (!user) return

    const revisionsChannel = supabase
      .channel('realtime:revisiones')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'revisiones' },
        (payload) => {
          push({
            id: payload.new.id,
            title: 'Nueva revisión registrada',
            body: `Bus ${payload.new.bus_ppu} · ${payload.new.terminal_detectado}`,
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
          push({
            id: payload.new.id,
            title: `Ticket ${payload.new.estado}`,
            body: `${payload.new.modulo} · ${payload.new.descripcion.slice(0, 60)}...`,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(revisionsChannel)
      supabase.removeChannel(ticketsChannel)
    }
  }, [push, user])
}
