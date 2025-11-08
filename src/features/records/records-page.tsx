import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Tables } from '@/types/database'

interface Filters {
  terminal: string
  estado: string
  query: string
}

export const RecordsPage = () => {
  const [filters, setFilters] = useState<Filters>({
    terminal: 'TODOS',
    estado: 'TODOS',
    query: '',
  })

  const { data: revisiones, isLoading } = useQuery({
    queryKey: ['records', filters],
    queryFn: async () => {
      let query = supabase.from('revisiones').select('*').order('created_at', { ascending: false })
      if (filters.terminal !== 'TODOS') {
        query = query.eq('terminal_detectado', filters.terminal)
      }
      if (filters.estado !== 'TODOS') {
        query = query.eq('estado_bus', filters.estado as 'OPERATIVO' | 'EN_PANNE')
      }
      if (filters.query) {
        query = query.ilike('bus_ppu', `%${filters.query.toUpperCase()}%`)
      }
      const { data, error } = await query.limit(200)
      if (error) throw error
      return data as Tables<'revisiones'>[]
    },
  })

  const exportXlsx = async () => {
    if (!revisiones?.length) return
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Revisiones')
    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Bus', key: 'bus', width: 20 },
      { header: 'Inspector', key: 'inspector', width: 24 },
      { header: 'Terminal', key: 'terminal', width: 18 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Observación', key: 'obs', width: 60 },
    ]
    revisiones.forEach((revision) => {
      sheet.addRow({
        fecha: dayjs(revision.created_at).format('DD-MM-YYYY HH:mm'),
        bus: `${revision.bus_ppu} · #${revision.bus_interno}`,
        inspector: revision.inspector_nombre,
        terminal: revision.terminal_detectado,
        estado: revision.estado_bus,
        obs: revision.observaciones,
      })
    })
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `revisiones_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!revisiones?.length) return
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('New Mini-Check · Resumen de revisiones', 14, 20)
    doc.setFontSize(11)
    revisiones.slice(0, 20).forEach((revision, index) => {
      const y = 35 + index * 12
      doc.text(`${revision.bus_ppu} · ${revision.terminal_detectado}`, 14, y)
      doc.text(dayjs(revision.created_at).format('DD MMM HH:mm'), 120, y)
      doc.text(revision.estado_bus, 170, y)
    })
    doc.save(`revisiones_${dayjs().format('YYYYMMDD_HHmm')}.pdf`)
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Input
              placeholder="Buscar por PPU o interno"
              value={filters.query}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, query: event.target.value }))
              }
            />
          </div>
          <Select
            value={filters.terminal}
            onValueChange={(terminal) => setFilters((prev) => ({ ...prev, terminal }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Terminal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="El Roble">El Roble</SelectItem>
              <SelectItem value="La Reina">La Reina</SelectItem>
              <SelectItem value="María Angélica">María Angélica</SelectItem>
              <SelectItem value="El Descanso">El Descanso</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.estado}
            onValueChange={(estado) => setFilters((prev) => ({ ...prev, estado }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="OPERATIVO">Operativo</SelectItem>
              <SelectItem value="EN_PANNE">En panne</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={exportXlsx}>
            Exportar XLSX
          </Button>
          <Button variant="outline" onClick={exportPdf}>
            Exportar PDF
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        <ScrollArea className="max-h-[70vh]">
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-900">
            <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/20">
              <tr>
                <th className="px-6 py-3">Bus</th>
                <th className="px-6 py-3">Inspector</th>
                <th className="px-6 py-3">Terminal</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Observación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70 dark:divide-slate-900/60">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    Cargando registros...
                  </td>
                </tr>
              )}
              {!isLoading &&
                revisiones?.map((revision) => (
                  <tr key={revision.id} className="text-slate-600">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                      {revision.bus_ppu} · #{revision.bus_interno}
                    </td>
                    <td className="px-6 py-4">{revision.inspector_nombre}</td>
                    <td className="px-6 py-4">{revision.terminal_detectado}</td>
                    <td className="px-6 py-4">
                      <Badge variant={revision.estado_bus === 'EN_PANNE' ? 'danger' : 'success'}>
                        {revision.estado_bus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {dayjs(revision.created_at).format('DD MMM · HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{revision.observaciones}</td>
                  </tr>
                ))}
              {!isLoading && !revisiones?.length && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    No hay registros para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Card>
    </div>
  )
}
