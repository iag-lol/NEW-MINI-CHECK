import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useNotificationStore } from '@/store/notification-store'
import { useAuthStore } from '@/store/auth-store'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'
import { Loader2, Trash2, PenSquare } from 'lucide-react'

interface Filters {
  terminal: string
  estado: string
  query: string
}

/** Elementos de la norma gráfica, en el orden del levantamiento en terreno */
const ELEMENTOS_NORMA = [
  { columna: 'interno_delantero', header: 'N° INTERNO DELANTERO' },
  { columna: 'interno_trasero', header: 'N° INTERNO TRASERO' },
  { columna: 'ppu_lateral_derecho', header: 'NORMA PPU LATERAL DERECHO' },
  { columna: 'ppu_trasera', header: 'NORMA PPU TRASERA' },
  { columna: 'patente_delantera', header: 'PATENTE DELANTERA' },
  { columna: 'patente_trasera', header: 'PATENTE TRASERA' },
] as const satisfies ReadonlyArray<{ columna: keyof Tables<'norma_grafica'>; header: string }>

const ETIQUETA_NORMA = {
  OK: 'CONFORME',
  DETERIORADO: 'DETERIORADO',
  FALTA: 'FALTA',
} as const

export const RecordsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)

  const [filters, setFilters] = useState<Filters>({
    terminal: 'TODOS',
    estado: 'TODOS',
    query: '',
  })

  // "Ver todas mis revisiones" llega desde el perfil con ?mias=1: la pantalla
  // debe abrirse ya filtrada, no mostrando las de todo el equipo.
  const [soloMias, setSoloMias] = useState(() => searchParams.get('mias') === '1')

  const { push } = useNotificationStore()
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // El Excel ahora consulta +15 y norma gráfica antes de armarse: sin aviso,
  // el botón parecía no responder
  const [exporting, setExporting] = useState(false)

  const alternarSoloMias = (valor: boolean) => {
    setSoloMias(valor)
    // La URL refleja el filtro: así se puede compartir o recargar sin perderlo
    const siguiente = new URLSearchParams(searchParams)
    if (valor) siguiente.set('mias', '1')
    else siguiente.delete('mias')
    setSearchParams(siguiente, { replace: true })
  }

  const { data: revisiones, isLoading, refetch } = useQuery({
    queryKey: ['records', filters, soloMias ? user?.rut : 'todos'],
    queryFn: async () => {
      let query = supabase.from('revisiones').select('*').order('created_at', { ascending: false })
      if (soloMias && user) {
        query = query.eq('inspector_rut', user.rut)
      }
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

  const openEditor = (revisionId: string) => {
    setSelectedRevisionId(revisionId)
    setSheetOpen(true)
  }

  const handleDelete = async (revisionId: string) => {
    if (!window.confirm('¿Eliminar este registro y todos sus datos asociados?')) return
    setDeletingId(revisionId)
    try {
      const childTables = ['tickets', 'tags', 'camaras', 'extintores', 'mobileye', 'odometro', 'rack', 'publicidad', 'wifi', 'mas15', 'norma_grafica']
      for (const table of childTables) {
        await supabase.from(table).delete().eq('revision_id', revisionId)
      }
      await supabase.from('revisiones').delete().eq('id', revisionId)
      push({
        id: `revision-deleted-${revisionId}`,
        title: 'Registro eliminado',
        body: 'El historial completo fue eliminado correctamente.',
        type: 'success',
      })
      refetch()
    } catch (error) {
      console.error('Error deleting revision', error)
      push({
        id: `revision-delete-error-${revisionId}`,
        title: 'No pudimos eliminar',
        body: 'Intenta nuevamente en unos segundos.',
        type: 'error',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const exportXlsx = async () => {
    if (!revisiones?.length) return
    setExporting(true)
    try {
      const ids = revisiones.map((revision) => revision.id)

      // Los módulos que se piden en el reporte se traen por revisión y no por
      // bus: aquí interesa qué se midió en ESA revisión, no el último dato
      // conocido del bus.
      const [{ data: mas15Data }, { data: normaData }] = await Promise.all([
        supabase.from('mas15').select('*').in('revision_id', ids),
        supabase.from('norma_grafica').select('*').in('revision_id', ids),
      ])

      const mas15PorRevision = new Map(
        ((mas15Data as Tables<'mas15'>[]) ?? []).map((fila) => [fila.revision_id, fila])
      )
      const normaPorRevision = new Map(
        ((normaData as Tables<'norma_grafica'>[]) ?? []).map((fila) => [fila.revision_id, fila])
      )

      // ExcelJS pesa ~940 kB: se trae al pulsar, no al abrir la pantalla
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Mini-Check'
      workbook.created = new Date()
      const sheet = workbook.addWorksheet('Revisiones', {
        views: [{ state: 'frozen', ySplit: 1 }],
      })
      sheet.columns = [
        { header: 'FECHA', key: 'fecha', width: 18 },
        { header: 'PPU', key: 'ppu', width: 12 },
        { header: 'N° INTERNO', key: 'interno', width: 11 },
        { header: 'INSPECTOR', key: 'inspector', width: 26 },
        { header: 'TERMINAL', key: 'terminal', width: 18 },
        { header: 'ESTADO BUS', key: 'estado', width: 14 },
        { header: '+15', key: 'mas15', width: 16 },
        { header: '+15 · ENCENDIDO PREVIO', key: 'mas15_arranque', width: 15 },
        { header: 'NORMA GRÁFICA', key: 'norma', width: 15 },
        ...ELEMENTOS_NORMA.map((elemento) => ({
          header: elemento.header,
          key: elemento.columna,
          width: 15,
        })),
        { header: 'OBSERVACIÓN', key: 'obs', width: 50 },
      ]

      const cabecera = sheet.getRow(1)
      cabecera.height = 32
      cabecera.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      })

      revisiones.forEach((revision) => {
        const mas15 = mas15PorRevision.get(revision.id)
        const norma = normaPorRevision.get(revision.id)

        const fila = sheet.addRow({
          fecha: dayjs(revision.created_at).format('DD-MM-YYYY HH:mm'),
          ppu: revision.bus_ppu,
          interno: revision.bus_interno,
          inspector: revision.inspector_nombre,
          terminal: revision.terminal_detectado,
          estado: revision.estado_bus === 'EN_PANNE' ? 'EN PANNE' : 'OPERATIVO',
          // NULL es "no se pudo medir", no un incumplimiento: se distingue
          mas15: !mas15
            ? 'NO REVISADO'
            : mas15.tiene_mas15 === null
              ? 'NO EVALUADO'
              : mas15.tiene_mas15
                ? 'CUENTA CON +15'
                : 'SIN +15',
          mas15_arranque: mas15 ? (mas15.arranque_ok ? 'CORRECTO' : 'NO SE LOGRÓ') : '-',
          norma: !norma ? 'NO REVISADO' : norma.cumple ? 'CUMPLE' : 'NO CUMPLE',
          ...Object.fromEntries(
            ELEMENTOS_NORMA.map((elemento) => [
              elemento.columna,
              norma ? ETIQUETA_NORMA[norma[elemento.columna]] : '-',
            ])
          ),
          obs: revision.observaciones ?? '-',
        })

        fila.height = 18
        fila.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.font = { size: 10, name: 'Calibri' }
          cell.alignment = {
            vertical: 'middle',
            horizontal: col === 4 || col === sheet.columnCount ? 'left' : 'center',
          }
        })
        fila.getCell(2).font = { size: 10, name: 'Calibri', bold: true }

        // Rojo sólo donde hay que actuar: un archivo con todo pintado no
        // ayuda a encontrar los buses que importan
        const marcar = (columna: number) => {
          fila.getCell(columna).font = {
            size: 10,
            name: 'Calibri',
            bold: true,
            color: { argb: 'FFB91C1C' },
          }
        }
        if (revision.estado_bus === 'EN_PANNE') marcar(6)
        if (mas15?.tiene_mas15 === false) marcar(7)
        if (norma && !norma.cumple) marcar(9)
        ELEMENTOS_NORMA.forEach((elemento, indice) => {
          if (!norma) return
          const celda = fila.getCell(10 + indice)
          if (norma[elemento.columna] === 'FALTA') {
            marcar(10 + indice)
          } else if (norma[elemento.columna] === 'DETERIORADO') {
            celda.font = {
              size: 10,
              name: 'Calibri',
              bold: true,
              color: { argb: 'FF92400E' },
            }
          }
        })
      })

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(sheet.rowCount, 1), column: sheet.columnCount },
      }

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
    } catch (error) {
      console.error('Error exportando revisiones', error)
      push({
        id: `export-error-${Date.now()}`,
        title: 'No pudimos generar el Excel',
        body: 'Revisa la conexión e inténtalo nuevamente.',
        type: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!revisiones?.length) return
    const { default: jsPDF } = await import('jspdf')
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
      <Card className="space-y-2.5">
        {/* Alcance del listado: mis revisiones o las de todo el equipo */}
        {user && (
          <div className="flex rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-1 dark:border-white/[0.06] dark:bg-white/[0.035]">
            {[
              { valor: true, etiqueta: 'Mis revisiones' },
              { valor: false, etiqueta: 'Todo el equipo' },
            ].map((opcion) => (
              <button
                key={String(opcion.valor)}
                type="button"
                onClick={() => alternarSoloMias(opcion.valor)}
                aria-pressed={soloMias === opcion.valor}
                className={cn(
                  'press-feedback flex-1 rounded-[calc(var(--app-radius-sm)-4px)] px-3 py-1.5 text-[12px] font-bold transition',
                  soloMias === opcion.valor
                    ? 'bg-brand-500 text-white shadow-[0_6px_16px_-10px_var(--color-brand-600)]'
                    : 'text-slate-600 dark:text-slate-300'
                )}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        )}

        {/* Rejilla de filtros: el buscador necesita el ancho completo en móvil */}
        <div className="grid gap-2 sm:gap-3 md:grid-cols-4">
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
              <SelectItem value="Los Agricultores">Los Agricultores</SelectItem>
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
          <Button variant="outline" onClick={exportXlsx} disabled={exporting}>
            {exporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {exporting ? 'Generando...' : 'Exportar XLSX'}
          </Button>
          <Button variant="outline" onClick={() => void exportPdf()}>
            Exportar PDF
          </Button>
        </div>
      </Card>

      {/* Tarjetas: la vista de móvil. Siete columnas no caben en un teléfono y
          arrastrar de lado hace perder de vista a qué bus pertenece cada dato. */}
      <div className="space-y-2 lg:hidden">
        {isLoading && (
          <Card className="py-9 text-center text-[12.5px] text-slate-400">
            Cargando registros...
          </Card>
        )}

        {!isLoading && !revisiones?.length && (
          <Card className="py-9 text-center text-[12.5px] text-slate-400">
            {soloMias
              ? 'Todavía no tienes revisiones con estos filtros.'
              : 'No hay registros para los filtros aplicados.'}
          </Card>
        )}

        {!isLoading &&
          revisiones?.map((revision) => (
            <Card key={revision.id} className="!p-0">
              <div className="flex items-start justify-between gap-2 border-b border-white/50 px-3 py-2.5 dark:border-white/[0.06]">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
                    {revision.bus_ppu}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    N° {revision.bus_interno} · {revision.terminal_detectado}
                  </p>
                </div>
                <Badge
                  variant={revision.estado_bus === 'EN_PANNE' ? 'danger' : 'success'}
                  className="shrink-0"
                >
                  {revision.estado_bus === 'EN_PANNE' ? 'En panne' : 'Operativo'}
                </Badge>
              </div>

              <dl className="divide-y divide-white/40 dark:divide-white/[0.04]">
                <FilaRegistro label="Inspector" valor={revision.inspector_nombre} />
                <FilaRegistro
                  label="Fecha"
                  valor={dayjs(revision.created_at).format('DD MMM YYYY · HH:mm')}
                />
                {revision.observaciones && (
                  <FilaRegistro label="Observación" valor={revision.observaciones} />
                )}
              </dl>

              <div className="flex gap-2 border-t border-white/50 p-2 dark:border-white/[0.06]">
                <Button
                  variant="subtle"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => openEditor(revision.id)}
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  Ver / editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 text-red-500 hover:bg-red-500/10"
                  onClick={() => handleDelete(revision.id)}
                  disabled={deletingId === revision.id}
                >
                  {deletingId === revision.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Eliminar
                </Button>
              </div>
            </Card>
          ))}
      </div>

      {/* Tabla: a partir de pantalla grande, donde sí caben las columnas */}
      <Card className="hidden p-0 lg:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-900">
              <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/20">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">Bus</th>
                  <th className="px-6 py-3 whitespace-nowrap">Inspector</th>
                  <th className="px-6 py-3 whitespace-nowrap">Terminal</th>
                  <th className="px-6 py-3 whitespace-nowrap">Estado</th>
                  <th className="px-6 py-3 whitespace-nowrap">Fecha</th>
                  <th className="px-6 py-3 whitespace-nowrap">Observación</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100/70 dark:divide-slate-900/60">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    Cargando registros...
                  </td>
                </tr>
              )}
              {!isLoading &&
                revisiones?.map((revision) => (
                  <tr key={revision.id} className="text-slate-600">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {revision.bus_ppu} · #{revision.bus_interno}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{revision.inspector_nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{revision.terminal_detectado}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={revision.estado_bus === 'EN_PANNE' ? 'danger' : 'success'}>
                        {revision.estado_bus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {dayjs(revision.created_at).format('DD MMM · HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs">
                      <div className="truncate" title={revision.observaciones || ''}>
                        {revision.observaciones}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditor(revision.id)}
                          title="Editar / ver"
                        >
                          <PenSquare className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(revision.id)}
                          disabled={deletingId === revision.id}
                          title="Eliminar"
                        >
                          {deletingId === revision.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && !revisiones?.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No hay registros para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) {
            setSelectedRevisionId(null)
          }
        }}
      >
        <SheetContent className="sm:w-[calc(100%-1.5rem)] sm:max-w-4xl">
          {selectedRevisionId && (
            <RevisionDetailSheet
              revisionId={selectedRevisionId}
              onSaved={() => {
                refetch()
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

interface RevisionDetailSheetProps {
  revisionId: string
  onSaved: () => void
}

type RevisionFormState = {
  estado_bus: 'OPERATIVO' | 'EN_PANNE'
  terminal_reportado: string
  observaciones: string
  tagSerie: string
  tagObservacion: string
  extObservacion: string
  mobileyeObservacion: string
  odometroLectura: string
  odometroEstado: 'OK' | 'INCONSISTENTE' | 'NO_FUNCIONA'
  odometroObservacion: string
}

type RevisionDetails = {
  revision: Tables<'revisiones'>
  tag: Tables<'tags'> | null
  camaras: Tables<'camaras'> | null
  extintores: Tables<'extintores'> | null
  mobileye: Tables<'mobileye'> | null
  odometro: Tables<'odometro'> | null
  rack: Tables<'rack'> | null
  publicidad: Tables<'publicidad'> | null
}

const baseFormState: RevisionFormState = {
  estado_bus: 'OPERATIVO',
  terminal_reportado: '',
  observaciones: '',
  tagSerie: '',
  tagObservacion: '',
  extObservacion: '',
  mobileyeObservacion: '',
  odometroLectura: '',
  odometroEstado: 'OK',
  odometroObservacion: '',
}

const RevisionDetailSheet = ({ revisionId, onSaved }: RevisionDetailSheetProps) => {
  const { push } = useNotificationStore()
  const [details, setDetails] = useState<RevisionDetails | null>(null)
  const [form, setForm] = useState<RevisionFormState>(baseFormState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadDetails = async () => {
    setLoading(true)
    try {
      const { data: revision, error } = await supabase
        .from('revisiones')
        .select('*')
        .eq('id', revisionId)
        .single()
      if (error || !revision) {
        throw error ?? new Error('Revision no encontrada')
      }
      const revisionRecord = revision as Tables<'revisiones'>

      const [tag, camaras, extintores, mobileye, odometro, rack, publicidad] = await Promise.all([
        supabase.from('tags').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('camaras').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('extintores').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('mobileye').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('odometro').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('rack').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('publicidad').select('*').eq('revision_id', revisionId).maybeSingle(),
      ])

      const tagData = (tag.data ?? null) as Tables<'tags'> | null
      const camarasData = (camaras.data ?? null) as Tables<'camaras'> | null
      const extintoresData = (extintores.data ?? null) as Tables<'extintores'> | null
      const mobileyeData = (mobileye.data ?? null) as Tables<'mobileye'> | null
      const odometroData = (odometro.data ?? null) as Tables<'odometro'> | null
      const rackData = (rack.data ?? null) as Tables<'rack'> | null
      const publicidadData = (publicidad.data ?? null) as Tables<'publicidad'> | null

      setDetails({
        revision: revisionRecord,
        tag: tagData,
        camaras: camarasData,
        extintores: extintoresData,
        mobileye: mobileyeData,
        odometro: odometroData,
        rack: rackData,
        publicidad: publicidadData,
      })

      setForm({
        estado_bus: revisionRecord.estado_bus,
        terminal_reportado: revisionRecord.terminal_reportado,
        observaciones: revisionRecord.observaciones ?? '',
        tagSerie: tagData?.serie ?? '',
        tagObservacion: tagData?.observacion ?? '',
        extObservacion: extintoresData?.observacion ?? '',
        mobileyeObservacion: mobileyeData?.observacion ?? '',
        odometroLectura:
          odometroData?.lectura !== undefined && odometroData?.lectura !== null
            ? String(odometroData?.lectura)
            : '',
        odometroEstado: odometroData?.estado ?? 'OK',
        odometroObservacion: odometroData?.observacion ?? '',
      })
    } catch (error) {
      console.error('Error loading revision details', error)
      push({
        id: `revision-load-error-${revisionId}`,
        title: 'No pudimos cargar el registro',
        body: 'Actualiza la página e inténtalo nuevamente.',
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId])

  const handleSave = async () => {
    if (!details) return
    setSaving(true)
    try {
      await supabase
        .from('revisiones')
        .update({
          estado_bus: form.estado_bus,
          terminal_reportado: form.terminal_reportado,
          observaciones: form.observaciones || null,
        })
        .eq('id', revisionId)

      if (details.tag) {
        await supabase
          .from('tags')
          .update({
            serie: form.tagSerie || null,
            observacion: form.tagObservacion || null,
          })
          .eq('revision_id', revisionId)
      }

      if (details.extintores) {
        await supabase
          .from('extintores')
          .update({
            observacion: form.extObservacion || null,
          })
          .eq('revision_id', revisionId)
      }

      if (details.mobileye) {
        await supabase
          .from('mobileye')
          .update({
            observacion: form.mobileyeObservacion || null,
          })
          .eq('revision_id', revisionId)
      }

      if (details.odometro) {
        const lecturaValue = form.odometroLectura.trim()
          ? Number(form.odometroLectura.trim())
          : details.odometro.lectura
        await supabase
          .from('odometro')
          .update({
            lectura: lecturaValue,
            estado: form.odometroEstado,
            observacion: form.odometroObservacion || null,
          })
          .eq('revision_id', revisionId)
      }
      push({
        id: `revision-updated-${revisionId}`,
        title: 'Registro actualizado',
        body: 'Los cambios quedaron guardados.',
        type: 'success',
      })
      onSaved()
    } catch (error) {
      console.error('Error updating revision', error)
      push({
        id: `revision-update-error-${revisionId}`,
        title: 'No pudimos guardar',
        body: 'Revisa los campos e inténtalo nuevamente.',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = <K extends keyof RevisionFormState>(key: K, value: RevisionFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const formatBool = (value: boolean | null | undefined, labels = ['Sí', 'No']): string => {
    if (value === null || value === undefined) return '—'
    return value ? labels[0] : labels[1]
  }

  const formatDetailList = (items: Array<{ label: string; value: string }>) => (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="text-sm text-slate-600 dark:text-slate-300">
          <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className="font-medium text-slate-900 dark:text-white">{item.value}</p>
        </div>
      ))}
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Cargando información...
      </div>
    )
  }

  if (!details) {
    return (
      <div className="text-sm text-red-500">
        No pudimos cargar los detalles de esta revisión. Cierra la ventana e inténtalo nuevamente.
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Registro</p>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">
          {details.revision.bus_ppu} · #{details.revision.bus_interno}
        </h2>
        <p className="text-sm text-slate-500">
          Inspector {details.revision.inspector_nombre} ·{' '}
          {dayjs(details.revision.created_at).format('DD MMM YYYY · HH:mm')} hrs
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-100/80 p-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Información general</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Estado del bus</Label>
            <Select
              value={form.estado_bus}
              onValueChange={(value: 'OPERATIVO' | 'EN_PANNE') => handleChange('estado_bus', value)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPERATIVO">Operativo</SelectItem>
                <SelectItem value="EN_PANNE">En panne</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Terminal reportado</Label>
            <Input
              className="mt-1.5"
              value={form.terminal_reportado}
              onChange={(event) => handleChange('terminal_reportado', event.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Observaciones generales</Label>
          <Textarea
            className="mt-1.5"
            value={form.observaciones}
            onChange={(event) => handleChange('observaciones', event.target.value)}
            rows={4}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-100/80 p-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Módulos editables</h3>
        {details.tag && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Serie TAG</Label>
              <Input
                className="mt-1.5"
                value={form.tagSerie}
                onChange={(event) => handleChange('tagSerie', event.target.value)}
              />
            </div>
            <div>
              <Label>Observación TAG</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={form.tagObservacion}
                onChange={(event) => handleChange('tagObservacion', event.target.value)}
              />
            </div>
          </div>
        )}
        {details.extintores && (
          <div>
            <Label>Observación extintores</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              value={form.extObservacion}
              onChange={(event) => handleChange('extObservacion', event.target.value)}
            />
          </div>
        )}
        {details.mobileye && (
          <div>
            <Label>Observación Mobileye</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              value={form.mobileyeObservacion}
              onChange={(event) => handleChange('mobileyeObservacion', event.target.value)}
            />
          </div>
        )}
        {details.odometro && (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Lectura odómetro</Label>
              <Input
                className="mt-1.5"
                value={form.odometroLectura}
                onChange={(event) => handleChange('odometroLectura', event.target.value)}
              />
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={form.odometroEstado}
                onValueChange={(value: 'OK' | 'INCONSISTENTE' | 'NO_FUNCIONA') =>
                  handleChange('odometroEstado', value)
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="INCONSISTENTE">Inconsistente</SelectItem>
                  <SelectItem value="NO_FUNCIONA">No funciona</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>Observación odómetro</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                value={form.odometroObservacion}
                onChange={(event) => handleChange('odometroObservacion', event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Detalle registrado</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Coordenadas</p>
            <p className="font-mono text-slate-900 dark:text-white">
              {details.revision.lat.toFixed(6)}, {details.revision.lon.toFixed(6)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">IP / Terminal</p>
            <p className="text-slate-600 dark:text-slate-300">
              {details.revision.ip_address ?? 'Sin IP'} · {details.revision.terminal_detectado}
            </p>
          </div>
        </div>
        {details.camaras && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Cámaras</p>
            <p className="text-slate-600 dark:text-slate-300">
              Monitor: {details.camaras.monitor_estado}{' '}
              {details.camaras.observacion ? `· ${details.camaras.observacion}` : ''}
            </p>
          </div>
        )}
        {details.publicidad && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Publicidad</p>
            <p className="text-slate-600 dark:text-slate-300">
              Izquierda: {details.publicidad.detalle_lados?.izquierda?.tiene ? 'Sí' : 'No'} · Derecha:{' '}
              {details.publicidad.detalle_lados?.derecha?.tiene ? 'Sí' : 'No'} · Luneta:{' '}
              {details.publicidad.detalle_lados?.luneta?.tiene ? 'Sí' : 'No'}
            </p>
          </div>
        )}
        {details.rack && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Rack</p>
            <p className="text-slate-600 dark:text-slate-300">
              Disco duro: {formatBool(details.rack.tiene_disco_duro)} · Candado:{' '}
              {formatBool(details.rack.tiene_candado)} · Cerraduras OK:{' '}
              {formatBool(details.rack.cerraduras_buen_estado)}
            </p>
          </div>
        )}
      </div>

      {details.tag && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">TAG</h3>
          {formatDetailList([
            { label: 'Instalado', value: formatBool(details.tag.tiene) },
            { label: 'Serie', value: details.tag.serie ?? '—' },
            { label: 'Observación', value: details.tag.observacion ?? '—' },
          ])}
        </div>
      )}

      {details.camaras && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cámaras</h3>
          {formatDetailList([
            { label: 'Estado de monitor', value: details.camaras.monitor_estado },
            {
              label: 'Detalle',
              value:
                details.camaras.observacion ??
                (details.camaras.detalle ? JSON.stringify(details.camaras.detalle) : '—'),
            },
          ])}
        </div>
      )}

      {details.extintores && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Extintores</h3>
          {formatDetailList([
            { label: 'Tiene', value: formatBool(details.extintores.tiene) },
            {
              label: 'Vencimiento',
              value:
                details.extintores.vencimiento_mes && details.extintores.vencimiento_anio
                  ? `${details.extintores.vencimiento_mes}/${details.extintores.vencimiento_anio}`
                  : '—',
            },
            { label: 'Certificación', value: details.extintores.certificacion ?? '—' },
            { label: 'Sonda', value: details.extintores.sonda ?? '—' },
            { label: 'Manómetro', value: details.extintores.manometro ?? '—' },
            { label: 'Presión', value: details.extintores.presion ?? '—' },
            { label: 'Cilindro', value: details.extintores.cilindro ?? '—' },
            { label: 'Porta', value: details.extintores.porta ?? '—' },
          ])}
        </div>
      )}

      {details.mobileye && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Mobileye</h3>
          {formatDetailList([
            { label: 'Marca bus', value: details.mobileye.bus_marca ?? '—' },
            { label: 'Alerta izquierda', value: formatBool(details.mobileye.alerta_izq) },
            { label: 'Alerta derecha', value: formatBool(details.mobileye.alerta_der) },
            { label: 'Consola', value: formatBool(details.mobileye.consola) },
            { label: 'Sensor frontal', value: formatBool(details.mobileye.sensor_frontal) },
            { label: 'Sensor izquierdo', value: formatBool(details.mobileye.sensor_izq) },
            { label: 'Sensor derecho', value: formatBool(details.mobileye.sensor_der) },
          ])}
        </div>
      )}

      {details.rack && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Rack</h3>
          {formatDetailList([
            { label: 'Disco duro', value: formatBool(details.rack.tiene_disco_duro) },
            { label: 'Seguridad extra', value: formatBool(details.rack.tiene_seguridad_extra) },
            { label: 'Candado', value: formatBool(details.rack.tiene_candado) },
            { label: 'Cerraduras buen estado', value: formatBool(details.rack.cerraduras_buen_estado) },
            {
              label: 'Cerraduras esperadas',
              value: details.rack.cantidad_cerraduras_esperada?.toString() ?? '—',
            },
            { label: 'Observación', value: details.rack.observacion ?? '—' },
          ])}
        </div>
      )}

      {details.publicidad && (() => {
        const publicity = details.publicidad
        type PublicidadDetalle = NonNullable<Tables<'publicidad'>['detalle_lados']>
        type PublicidadLado = PublicidadDetalle[keyof PublicidadDetalle]
        const detalleLados = publicity.detalle_lados as Record<string, PublicidadLado> | null
        return (
          <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Publicidad</h3>
            {['izquierda', 'derecha', 'luneta'].map((lado) => {
              const info = detalleLados?.[lado]
              return (
                <div key={lado} className="rounded-xl border border-slate-100/70 p-3 dark:border-slate-800">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{lado}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {info?.tiene ? 'Con publicidad' : 'Sin publicidad'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Daño: {formatBool(info?.danio)} · Residuos: {formatBool(info?.residuos)}
                  </p>
                </div>
              )
            })}
          </div>
        )
      })()}

      {details.odometro && (
        <div className="space-y-3 rounded-2xl border border-slate-100/80 p-4 text-sm dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Odómetro</h3>
          {formatDetailList([
            { label: 'Lectura', value: details.odometro.lectura?.toString() ?? '—' },
            { label: 'Estado', value: details.odometro.estado },
            { label: 'Observación', value: details.odometro.observacion ?? '—' },
          ])}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={loadDetails}>
          Recargar datos
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}

/** Fila etiqueta/valor de la tarjeta de registro en móvil. */
const FilaRegistro = ({ label, valor }: { label: string; valor: string }) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2">
    <dt className="shrink-0 pt-px text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
      {label}
    </dt>
    <dd className="min-w-0 flex-1 text-right text-[12px] text-slate-700 dark:text-slate-200">
      {valor}
    </dd>
  </div>
)
