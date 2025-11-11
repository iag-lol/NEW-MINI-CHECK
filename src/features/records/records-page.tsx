import { useState, useEffect } from 'react'
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
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useNotificationStore } from '@/store/notification-store'
import type { Tables } from '@/types/database'
import { Loader2, Trash2, PenSquare } from 'lucide-react'

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
  const { push } = useNotificationStore()
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: revisiones, isLoading, refetch } = useQuery({
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

  const openEditor = (revisionId: string) => {
    setSelectedRevisionId(revisionId)
    setSheetOpen(true)
  }

  const handleDelete = async (revisionId: string) => {
    if (!window.confirm('¿Eliminar este registro y todos sus datos asociados?')) return
    setDeletingId(revisionId)
    try {
      const childTables = ['tickets', 'tags', 'camaras', 'extintores', 'mobileye', 'odometro', 'publicidad']
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
          <div className="overflow-x-auto">
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
        </ScrollArea>
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
        <SheetContent className="w-full max-w-4xl">
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

      const [tag, camaras, extintores, mobileye, odometro, publicidad] = await Promise.all([
        supabase.from('tags').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('camaras').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('extintores').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('mobileye').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('odometro').select('*').eq('revision_id', revisionId).maybeSingle(),
        supabase.from('publicidad').select('*').eq('revision_id', revisionId).maybeSingle(),
      ])

      const tagData = (tag.data ?? null) as Tables<'tags'> | null
      const camarasData = (camaras.data ?? null) as Tables<'camaras'> | null
      const extintoresData = (extintores.data ?? null) as Tables<'extintores'> | null
      const mobileyeData = (mobileye.data ?? null) as Tables<'mobileye'> | null
      const odometroData = (odometro.data ?? null) as Tables<'odometro'> | null
      const publicidadData = (publicidad.data ?? null) as Tables<'publicidad'> | null

      setDetails({
        revision: revisionRecord,
        tag: tagData,
        camaras: camarasData,
        extintores: extintoresData,
        mobileye: mobileyeData,
        odometro: odometroData,
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

      {details.publicidad && (() => {
        const publicity = details.publicidad
        const detalleLados = publicity.detalle_lados as Record<string, any> | null
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
