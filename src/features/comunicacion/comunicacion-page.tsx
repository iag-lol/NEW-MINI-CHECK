import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import type { Tables } from '@/types/database'

export const ComunicacionPage = () => {
  const { data } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'tickets'>[]
    },
  })

  const grouped = useMemo(() => {
    if (!data) return []
    const byTerminal = data.reduce<Record<string, Tables<'tickets'>[]>>((acc, ticket) => {
      acc[ticket.terminal] = acc[ticket.terminal]
        ? [...acc[ticket.terminal], ticket]
        : [ticket]
      return acc
    }, {})
    return Object.entries(byTerminal).map(([terminal, tickets]) => ({
      terminal,
      tickets,
      pendientes: tickets.filter((ticket) => ticket.estado !== 'RESUELTO').length,
    }))
  }, [data])

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <Card key={group.terminal} className="space-y-3 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-brand-50 p-2 text-brand-600">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {group.terminal}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {group.pendientes} pendientes
              </h3>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-slate-500">
            {group.tickets.slice(0, 3).map((ticket) => (
              <li key={ticket.id}>
                {ticket.modulo}: {ticket.descripcion}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {!grouped.length && (
        <Card className="p-6 text-center text-sm text-slate-500">
          Sin alertas para comunicar en este momento.
        </Card>
      )}
    </div>
  )
}
