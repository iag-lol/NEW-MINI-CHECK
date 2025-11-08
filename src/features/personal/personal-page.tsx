import { useQuery } from '@tanstack/react-query'
import { Phone, UserCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/types/database'

export const PersonalPage = () => {
  const { data } = useQuery({
    queryKey: ['personal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('personal').select('*')
      if (error) throw error
      return data as Tables<'personal'>[]
    },
  })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data?.map((person) => (
        <Card key={person.id} className="flex items-center gap-4 p-5">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-500 dark:bg-slate-900/40">
            <UserCircle2 className="h-8 w-8" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{person.nombre}</p>
            <p className="text-sm text-slate-500">{person.cargo}</p>
            <p className="text-xs text-slate-400">{person.terminal}</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            {person.telefono && (
              <a href={`tel:${person.telefono}`} className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {person.telefono}
              </a>
            )}
            <Badge variant="outline" className="mt-2">
              {person.estado}
            </Badge>
          </div>
        </Card>
      ))}
      {!data?.length && (
        <Card className="p-6 text-center text-sm text-slate-500">
          Aún no hay personal registrado.
        </Card>
      )}
    </div>
  )
}
