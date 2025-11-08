import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BusFront } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { Tables } from '@/types/database'

export const FlotaPage = () => {
  const [query, setQuery] = useState('')
  const { data: flota } = useQuery({
    queryKey: ['flota'],
    queryFn: async () => {
      const { data, error } = await supabase.from('flota').select('*').order('ppu')
      if (error) throw error
      return data as Tables<'flota'>[]
    },
  })

  const filtered = useMemo(() => {
    if (!flota) return []
    if (!query) return flota
    return flota.filter(
      (bus) =>
        bus.ppu.toLowerCase().includes(query.toLowerCase()) ||
        bus.numero_interno.toLowerCase().includes(query.toLowerCase())
    )
  }, [flota, query])

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Flota</p>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white">Inventario</h2>
        <Input
          className="mt-4"
          placeholder="Buscar PPU o número interno"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((bus) => (
          <Card key={bus.id} className="flex items-center gap-4 p-4">
            <div className="rounded-2xl bg-brand-50 p-3 text-brand-600">
              <BusFront className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{bus.ppu}</p>
              <p className="text-sm text-slate-500">
                #{bus.numero_interno} · {bus.marca} {bus.modelo} · {bus.anio}
              </p>
            </div>
            <Badge variant="outline">{bus.terminal}</Badge>
          </Card>
        ))}
        {!filtered.length && (
          <p className="col-span-full text-center text-sm text-slate-500">
            No se encontraron buses con ese criterio.
          </p>
        )}
      </div>
    </div>
  )
}
