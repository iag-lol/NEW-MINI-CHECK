import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock } from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/types/database'

export const PendientesPage = () => {
  const { data: tickets, refetch } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'tickets'>[]
    },
    refetchInterval: 15_000,
  })

  const updateTicket = async (id: string, estado: Tables<'tickets'>['estado']) => {
    await supabase.from('tickets').update({ estado }).eq('id', id)
    refetch()
  }

  return (
    <div className="space-y-4">
      {tickets?.map((ticket) => (
        <Card key={ticket.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-400">{ticket.modulo}</p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {ticket.descripcion}
            </h3>
            <p className="text-xs text-slate-500">
              {ticket.terminal} · {dayjs(ticket.created_at).format('DD MMM HH:mm')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                ticket.estado === 'RESUELTO'
                  ? 'success'
                  : ticket.estado === 'EN_PROCESO'
                  ? 'warning'
                  : 'danger'
              }
            >
              {ticket.estado}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-2xl"
              onClick={() => updateTicket(ticket.id, 'EN_PROCESO')}
            >
              <Clock className="h-4 w-4" />
              En proceso
            </Button>
            <Button
              size="sm"
              className="gap-2 rounded-2xl"
              onClick={() => updateTicket(ticket.id, 'RESUELTO')}
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar resuelto
            </Button>
          </div>
        </Card>
      ))}
      {!tickets?.length && (
        <Card className="p-6 text-center text-sm text-slate-500">Sin tickets pendientes.</Card>
      )}
    </div>
  )
}
