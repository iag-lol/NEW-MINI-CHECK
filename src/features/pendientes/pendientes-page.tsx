import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BusFront,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  Search,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { useAuthStore } from '@/store/auth-store'
import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'

type FlotaRow = Tables<'flota'>
type RevisionRow = Tables<'revisiones'>

export const PendientesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { weekInfo } = useWeekFilter()
  const [terminalFilter, setTerminalFilter] = useState(user?.terminal ?? 'TODOS')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: flota, isLoading: flotaLoading } = useQuery({
    queryKey: ['flota-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flota')
        .select('*')
        .order('numero_interno', { ascending: true })
      if (error) throw error
      return (data ?? []) as FlotaRow[]
    },
  })

  const { data: revisiones, isLoading: revisionesLoading } = useQuery({
    queryKey: ['pendientes-revisiones', weekInfo.startISO, weekInfo.endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revisiones')
        .select('id, bus_ppu, bus_interno, inspector_nombre, terminal_detectado, estado_bus, created_at')
        .gte('created_at', weekInfo.startISO)
        .lte('created_at', weekInfo.endISO)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RevisionRow[]
    },
    refetchInterval: 15_000,
  })

  const buses = useMemo(() => {
    if (!flota) return []
    const latestByBus = new Map<string, RevisionRow>()
    revisiones?.forEach((revision) => {
      if (!latestByBus.has(revision.bus_ppu)) {
        latestByBus.set(revision.bus_ppu, revision)
      }
    })

    return flota.map((bus) => {
      const lastRevision = latestByBus.get(bus.ppu) ?? null
      const pending = !lastRevision
      return {
        bus,
        lastRevision,
        pending,
        lastInspectionAt: lastRevision ? dayjs(lastRevision.created_at) : null,
      }
    })
  }, [flota, revisiones])

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toUpperCase()
    return buses
      .filter((item) => {
        if (terminalFilter !== 'TODOS' && item.bus.terminal !== terminalFilter) {
          return false
        }
        if (!query) return true
        return (
          item.bus.ppu.toUpperCase().includes(query) ||
          item.bus.numero_interno.toUpperCase().includes(query)
        )
      })
      .sort((a, b) => {
        if (a.pending && !b.pending) return -1
        if (!a.pending && b.pending) return 1
        return a.bus.numero_interno.localeCompare(b.bus.numero_interno)
      })
  }, [buses, terminalFilter, searchQuery])

  const pendingCount = filtered.filter((item) => item.pending).length
  const total = filtered.length
  const completedCount = total - pendingCount
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0

  const handleStartRevision = (bus: FlotaRow) => {
    navigate(`/app/formulario?ppu=${encodeURIComponent(bus.ppu)}`)
  }

  const handleDownloadPDF = () => {
    const pendingBuses = filtered.filter((item) => item.pending)

    if (pendingBuses.length === 0) {
      alert('No hay buses pendientes para exportar')
      return
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
    })

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15

    // FONDO DEGRADADO PROFESIONAL
    doc.setFillColor(15, 23, 42) // slate-900
    doc.rect(0, 0, pageWidth, 45, 'F')

    doc.setFillColor(59, 130, 246) // blue-500 accent
    doc.rect(0, 0, pageWidth, 8, 'F')

    // LOGO Y TÍTULO
    doc.setFontSize(28)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('🚌 BUSES PENDIENTES', margin, 25)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(203, 213, 225) // slate-300
    const weekText = `Semana ${weekInfo.weekNumber} · ${weekInfo.label}`
    doc.text(weekText, margin, 32)

    const terminal = terminalFilter === 'TODOS' ? 'Todos los terminales' : `Terminal ${terminalFilter}`
    doc.text(terminal, margin, 37)

    // ESTADÍSTICAS EN HEADER
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    const statsText = `${pendingBuses.length} pendientes de ${total} buses totales`
    const statsWidth = doc.getTextWidth(statsText)
    doc.text(statsText, pageWidth - margin - statsWidth, 30)

    // FECHA DE GENERACIÓN
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184) // slate-400
    const dateText = `Generado: ${dayjs().format('DD/MM/YYYY HH:mm')} hrs`
    const dateWidth = doc.getTextWidth(dateText)
    doc.text(dateText, pageWidth - margin - dateWidth, 36)

    // LÍNEA SEPARADORA ELEGANTE
    doc.setDrawColor(59, 130, 246)
    doc.setLineWidth(0.5)
    doc.line(margin, 42, pageWidth - margin, 42)

    // TABLA - ENCABEZADOS CON DISEÑO PROFESIONAL
    let yPos = 55

    doc.setFillColor(241, 245, 249) // slate-100
    doc.rect(margin, yPos - 7, pageWidth - 2 * margin, 10, 'F')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(51, 65, 85) // slate-700

    const colWidths = {
      num: 15,
      ppu: 45,
      interno: 40,
      ubicacion: pageWidth - 2 * margin - 100,
    }

    doc.text('#', margin + 3, yPos)
    doc.text('PPU', margin + colWidths.num + 3, yPos)
    doc.text('Nº INTERNO', margin + colWidths.num + colWidths.ppu + 3, yPos)
    doc.text('UBICACIÓN', margin + colWidths.num + colWidths.ppu + colWidths.interno + 3, yPos)

    yPos += 12

    // FILAS DE DATOS
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    pendingBuses.forEach((item, index) => {
      // Verificar si necesitamos nueva página
      if (yPos > pageHeight - 30) {
        doc.addPage()
        yPos = 20

        // Repetir encabezados en nueva página
        doc.setFillColor(241, 245, 249)
        doc.rect(margin, yPos - 7, pageWidth - 2 * margin, 10, 'F')

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(51, 65, 85)

        doc.text('#', margin + 3, yPos)
        doc.text('PPU', margin + colWidths.num + 3, yPos)
        doc.text('Nº INTERNO', margin + colWidths.num + colWidths.ppu + 3, yPos)
        doc.text('UBICACIÓN', margin + colWidths.num + colWidths.ppu + colWidths.interno + 3, yPos)

        yPos += 12
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
      }

      // Fondo alternado para filas
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252) // slate-50
        doc.rect(margin, yPos - 7, pageWidth - 2 * margin, 10, 'F')
      }

      // BORDE DE FILA
      doc.setDrawColor(226, 232, 240) // slate-200
      doc.setLineWidth(0.1)
      doc.line(margin, yPos + 3, pageWidth - margin, yPos + 3)

      // CONTENIDO
      doc.setTextColor(30, 41, 59) // slate-800

      // Número
      doc.setFont('helvetica', 'bold')
      doc.text(`${index + 1}`, margin + 3, yPos)

      // PPU
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(59, 130, 246) // blue-600
      doc.text(item.bus.ppu, margin + colWidths.num + 3, yPos)

      // Número interno
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105) // slate-600
      doc.text(item.bus.numero_interno, margin + colWidths.num + colWidths.ppu + 3, yPos)

      // Celda de ubicación (vacía con borde)
      const ubicacionX = margin + colWidths.num + colWidths.ppu + colWidths.interno
      doc.setDrawColor(203, 213, 225) // slate-300
      doc.setLineWidth(0.3)
      doc.rect(ubicacionX, yPos - 6, colWidths.ubicacion, 8)

      yPos += 12
    })

    // FOOTER PROFESIONAL
    const footerY = pageHeight - 15

    doc.setFillColor(15, 23, 42) // slate-900
    doc.rect(0, footerY - 5, pageWidth, 20, 'F')

    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184) // slate-400
    doc.setFont('helvetica', 'normal')
    doc.text('New Mini-Check · Sistema de Revisión de Flota', margin, footerY)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(59, 130, 246) // blue-400
    const pageNum = `Página 1 de ${doc.getNumberOfPages()}`
    const pageNumWidth = doc.getTextWidth(pageNum)
    doc.text(pageNum, pageWidth - margin - pageNumWidth, footerY)

    // GUARDAR PDF
    const fileName = `Buses_Pendientes_Semana${weekInfo.weekNumber}_${dayjs().format('YYYYMMDD')}.pdf`
    doc.save(fileName)
  }

  const loading = flotaLoading || revisionesLoading

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-brand-500">
              Control diario
            </p>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">
              Buses pendientes
            </h1>
            <p className="text-sm text-slate-500">
              Revisa cuáles buses aún no tienen inspección registrada esta semana.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <WeekSelector />
            <Button
              onClick={handleDownloadPDF}
              disabled={pendingCount === 0}
              className="gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
            >
              <Download className="h-4 w-4" />
              Descargar PDF Pendientes
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[240px,1fr]">
          <div>
            <Select value={terminalFilter} onValueChange={setTerminalFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar terminal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los terminales</SelectItem>
                <SelectItem value="El Roble">El Roble</SelectItem>
                <SelectItem value="La Reina">La Reina</SelectItem>
                <SelectItem value="María Angélica">María Angélica</SelectItem>
                <SelectItem value="El Descanso">El Descanso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por PPU o Nº interno"
              className="pl-9"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Pendientes"
          value={pendingCount}
          description="Sin revisión esta semana"
          icon={AlertTriangle}
          variant={pendingCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Completados"
          value={completedCount}
          description="Revisados esta semana"
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          title="Avance semanal"
          value={`${progress}%`}
          description={`${completedCount} de ${total} buses`}
          icon={Compass}
          variant={progress >= 80 ? 'success' : progress >= 50 ? 'info' : 'warning'}
        />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-900">
          <div>
            <h2 className="text-lg font-semibold">Listado de buses</h2>
            <p className="text-sm text-slate-500">
              {pendingCount} pendientes · {completedCount} completados
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {loading && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              Cargando flota...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No encontramos buses con esos filtros.
            </div>
          )}
          {!loading &&
            filtered.map(({ bus, lastRevision, pending }) => (
              <div
                key={bus.id}
                className="flex flex-col gap-4 border-t border-transparent px-6 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/30 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <BusFront className="h-5 w-5 text-brand-500" />
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {bus.ppu} · #{bus.numero_interno}
                      </p>
                      <p className="text-xs text-slate-500">
                        Terminal {bus.terminal}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {lastRevision ? (
                      <>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Revisado {lastRevision.inspector_nombre}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {dayjs(lastRevision.created_at).format('DD MMM HH:mm')}
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        Sin inspección esta semana
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <Badge variant={pending ? 'warning' : 'success'}>
                    {pending ? 'Pendiente' : 'Completado'}
                  </Badge>
                  {pending ? (
                    <Button size="sm" className="rounded-xl" onClick={() => handleStartRevision(bus)}>
                      Iniciar revisión
                    </Button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Ult. estado: {lastRevision?.estado_bus ?? '—'}
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  )
}
