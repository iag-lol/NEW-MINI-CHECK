import { useState, useEffect } from 'react'
import { Globe, MapPin, Wifi, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import dayjs from '@/lib/dayjs'

type IPStats = {
  ip: string
  count: number
  lastUsed: string
  inspectors: string[]
  locations: Array<{ city: string | null; region: string | null }>
  isp: string | null
}

export function IPAnalytics() {
  const [ipStats, setIpStats] = useState<IPStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadIPStats()
  }, [])

  const loadIPStats = async () => {
    try {
      const { data: revisiones } = await supabase
        .from('revisiones')
        .select('*')
        .not('ip_address', 'is', null)
        .order('created_at', { ascending: false })

      if (!revisiones) return

      // Agrupar por IP
      const ipMap = new Map<string, IPStats>()

      for (const revision of revisiones) {
        if (!revision.ip_address) continue

        const existing = ipMap.get(revision.ip_address)

        if (existing) {
          existing.count++
          if (!existing.inspectors.includes(revision.inspector_nombre)) {
            existing.inspectors.push(revision.inspector_nombre)
          }
          if (revision.ip_info) {
            const location = {
              city: revision.ip_info.city,
              region: revision.ip_info.region,
            }
            if (!existing.locations.some((l) => l.city === location.city)) {
              existing.locations.push(location)
            }
          }
        } else {
          ipMap.set(revision.ip_address, {
            ip: revision.ip_address,
            count: 1,
            lastUsed: revision.created_at,
            inspectors: [revision.inspector_nombre],
            locations: revision.ip_info
              ? [{ city: revision.ip_info.city, region: revision.ip_info.region }]
              : [],
            isp: revision.ip_info?.isp || null,
          })
        }
      }

      setIpStats(
        Array.from(ipMap.values()).sort((a, b) => b.count - a.count)
      )
    } catch (error) {
      console.error('Error loading IP stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Cargando análisis de IP...</p>
      </Card>
    )
  }

  const totalIPs = ipStats.length
  const totalInspections = ipStats.reduce((acc, ip) => acc + ip.count, 0)
  const avgInspectionsPerIP = totalIPs > 0 ? (totalInspections / totalIPs).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={Globe}
          label="IPs Únicas"
          value={totalIPs.toString()}
          color="blue"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Inspecciones Rastreadas"
          value={totalInspections.toString()}
          color="green"
        />
        <SummaryCard
          icon={Wifi}
          label="Promedio/IP"
          value={avgInspectionsPerIP}
          color="purple"
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold">Actividad por Dirección IP</h3>
        {ipStats.map((stats) => (
          <IPCard key={stats.ip} stats={stats} />
        ))}
      </div>

      {ipStats.length === 0 && (
        <Card className="p-12 text-center">
          <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No hay datos de IP</h3>
          <p className="text-sm text-muted-foreground">
            Las nuevas inspecciones comenzarán a registrar información de IP
          </p>
        </Card>
      )}
    </div>
  )
}

interface SummaryCardProps {
  icon: typeof Globe
  label: string
  value: string
  color: 'blue' | 'green' | 'purple'
}

function SummaryCard({ icon: Icon, label, value, color }: SummaryCardProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  )
}

interface IPCardProps {
  stats: IPStats
}

function IPCard({ stats }: IPCardProps) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-lg font-bold">{stats.ip}</p>
            {stats.isp && (
              <p className="text-sm text-muted-foreground">{stats.isp}</p>
            )}
          </div>
          <div className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
            {stats.count} {stats.count === 1 ? 'inspección' : 'inspecciones'}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Ubicaciones detectadas:</span>
            </div>
            <div className="mt-2 space-y-1">
              {stats.locations.length > 0 ? (
                stats.locations.map((loc, idx) => (
                  <div key={idx} className="rounded bg-gray-100 px-2 py-1 text-sm">
                    {loc.city}, {loc.region}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos de ubicación</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>Inspectores usando esta IP:</span>
            </div>
            <div className="mt-2 space-y-1">
              {stats.inspectors.map((inspector) => (
                <div key={inspector} className="rounded bg-green-100 px-2 py-1 text-sm text-green-700">
                  {inspector}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Última actividad: {dayjs(stats.lastUsed).format('DD/MM/YYYY HH:mm')}
        </div>
      </div>
    </Card>
  )
}
