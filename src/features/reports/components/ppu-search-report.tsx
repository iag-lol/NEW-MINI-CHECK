import { useState, useEffect } from 'react'
import { Search, MapPin, User, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import dayjs from '@/lib/dayjs'
import type { Tables } from '@/types/database'

type Revision = Tables<'revisiones'>
type ExtendedRevision = Revision & {
  inspector_details?: string
  module_details?: Record<string, unknown>
}

export function PPUSearchReport() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<ExtendedRevision[]>([])
  const [busInfo, setBusInfo] = useState<Tables<'flota'> | null>(null)
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      // Buscar info del bus
      const { data: busData } = await supabase
        .from('flota')
        .select('*')
        .or(`ppu.ilike.%${searchQuery}%,numero_interno.ilike.%${searchQuery}%`)
        .single()

      const bus = busData as Tables<'flota'> | null
      setBusInfo(bus)

      if (!bus) {
        setResults([])
        return
      }

      // Buscar todas las revisiones de este bus
      const { data: revisiones, error } = await supabase
        .from('revisiones')
        .select('*')
        .eq('bus_ppu', bus.ppu)
        .order('created_at', { ascending: false })

      if (error) throw error

      setResults((revisiones as ExtendedRevision[]) || [])
    } catch (error) {
      console.error('Error searching:', error)
    } finally {
      setSearching(false)
    }
  }


  const toggleExpand = async (revisionId: string) => {
    if (expandedRevision === revisionId) {
      setExpandedRevision(null)
    } else {
      setExpandedRevision(revisionId)
      // Aquí podrías cargar datos adicionales si es necesario
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Buscar Historial de Bus</h3>
            <p className="text-sm text-muted-foreground">
              Ingresa la patente (PPU) o número interno del bus
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Ej: ABCD12 o 1234"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} className="px-8">
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Bus Info */}
      {busInfo && (
        <Card className="p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-xl font-bold">Información del Bus</h3>
              <div className="space-y-2">
                <InfoRow label="Patente (PPU)" value={busInfo.ppu} />
                <InfoRow label="Número Interno" value={busInfo.numero_interno} />
                <InfoRow label="Marca" value={busInfo.marca} />
                <InfoRow label="Modelo" value={busInfo.modelo} />
                <InfoRow label="Año" value={busInfo.anio.toString()} />
                <InfoRow label="Terminal" value={busInfo.terminal} />
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-xl font-bold">Estadísticas</h3>
              <div className="space-y-2">
                <InfoRow label="Total Inspecciones" value={results.length.toString()} />
                <InfoRow
                  label="Última Inspección"
                  value={
                    results[0] ? dayjs(results[0].created_at).format('DD/MM/YYYY HH:mm') : 'N/A'
                  }
                />
                <InfoRow
                  label="Inspectores Únicos"
                  value={new Set(results.map((r) => r.inspector_rut)).size.toString()}
                />
                <InfoRow
                  label="Operatividad"
                  value={
                    results.length > 0
                      ? `${Math.round((results.filter((r) => r.operativo).length / results.length) * 100)}%`
                      : 'N/A'
                  }
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Revision History */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xl font-bold">Historial de Inspecciones ({results.length})</h3>
          {results.map((revision) => (
            <RevisionCard
              key={revision.id}
              revision={revision}
              expanded={expandedRevision === revision.id}
              onToggle={() => toggleExpand(revision.id)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!busInfo && !searching && (
        <Card className="p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No hay resultados</h3>
          <p className="text-sm text-muted-foreground">
            Busca un bus para ver su historial completo de inspecciones
          </p>
        </Card>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

interface RevisionCardProps {
  revision: ExtendedRevision
  expanded: boolean
  onToggle: () => void
}

function RevisionCard({ revision, expanded, onToggle }: RevisionCardProps) {
  const [moduleData, setModuleData] = useState<Record<string, unknown> | null>(null)

  const loadModuleData = async () => {
    if (!moduleData && expanded) {
      const data = await getModuleData(revision.id)
      setModuleData(data)
    }
  }

  useEffect(() => {
    if (expanded) {
      loadModuleData()
    }
  }, [expanded])

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  revision.operativo
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {revision.operativo ? 'OPERATIVO' : 'EN PANNE'}
              </div>
              <span className="text-sm text-muted-foreground">
                {dayjs(revision.created_at).format('DD/MM/YYYY HH:mm')}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{revision.inspector_nombre}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{revision.terminal_reportado}</span>
              </div>
              {revision.ip_address && (
                <div className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{revision.ip_address}</span>
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 font-semibold">Detalles de Inspección</h4>
                <div className="space-y-1 text-sm">
                  <InfoRow label="RUT Inspector" value={revision.inspector_rut} />
                  <InfoRow label="Terminal Detectado" value={revision.terminal_detectado} />
                  <InfoRow label="Semana ISO" value={revision.semana_iso} />
                  <InfoRow label="Coordenadas" value={`${revision.lat.toFixed(6)}, ${revision.lon.toFixed(6)}`} />
                </div>
              </div>
              {revision.ip_info && (
                <div>
                  <h4 className="mb-2 font-semibold">Información de Red</h4>
                  <div className="space-y-1 text-sm">
                    {revision.ip_info.city && <InfoRow label="Ciudad" value={revision.ip_info.city} />}
                    {revision.ip_info.region && <InfoRow label="Región" value={revision.ip_info.region} />}
                    {revision.ip_info.country && <InfoRow label="País" value={revision.ip_info.country} />}
                    {revision.ip_info.isp && <InfoRow label="ISP" value={revision.ip_info.isp} />}
                  </div>
                </div>
              )}
            </div>
            {revision.observaciones && (
              <div>
                <h4 className="mb-2 font-semibold">Observaciones</h4>
                <p className="text-sm text-muted-foreground">{revision.observaciones}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

async function getModuleData(revisionId: string) {
  try {
    const [camaras, tags, extintores, odometro, mobileye, publicidad] = await Promise.all([
      supabase.from('camaras').select('*').eq('revision_id', revisionId).single(),
      supabase.from('tags').select('*').eq('revision_id', revisionId).single(),
      supabase.from('extintores').select('*').eq('revision_id', revisionId).single(),
      supabase.from('odometro').select('*').eq('revision_id', revisionId).single(),
      supabase.from('mobileye').select('*').eq('revision_id', revisionId).maybeSingle(),
      supabase.from('publicidad').select('*').eq('revision_id', revisionId).single(),
    ])

    return {
      camaras: camaras.data,
      tags: tags.data,
      extintores: extintores.data,
      odometro: odometro.data,
      mobileye: mobileye.data,
      publicidad: publicidad.data,
    }
  } catch (error) {
    console.error('Error fetching module data:', error)
    return null
  }
}
