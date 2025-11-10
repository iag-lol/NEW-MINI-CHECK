import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type ActiveInspector = Tables<'usuarios_activos'>

const sortByHeartbeat = (items: ActiveInspector[]) =>
  [...items].sort(
    (a, b) =>
      new Date(b.last_heartbeat).valueOf() -
      new Date(a.last_heartbeat).valueOf()
  )

export const useActiveInspectors = () => {
  const [inspectors, setInspectors] = useState<ActiveInspector[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const fetchActiveInspectors = async () => {
      const { data, error } = await supabase
        .from('usuarios_activos')
        .select('*')
        .order('last_heartbeat', { ascending: false })

      if (!isMounted) return

      if (error) {
        console.error('Error cargando usuarios activos', error)
        setInspectors([])
      } else {
        setInspectors(
          sortByHeartbeat(((data ?? []) as ActiveInspector[]))
        )
      }
      setLoading(false)
    }

    fetchActiveInspectors()

    const channel = supabase
      .channel('realtime:usuarios_activos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios_activos' },
        (payload) => {
          setInspectors((prev) => {
            if (payload.eventType === 'DELETE') {
              const rut =
                (payload.old as ActiveInspector | null)?.usuario_rut ?? null
              if (!rut) return prev
              return prev.filter((inspector) => inspector.usuario_rut !== rut)
            }

            const next = payload.new as ActiveInspector | null
            if (!next) return prev

            const withoutPrev = prev.filter(
              (inspector) => inspector.usuario_rut !== next.usuario_rut
            )
            return sortByHeartbeat([next, ...withoutPrev])
          })
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { inspectors, loading }
}
