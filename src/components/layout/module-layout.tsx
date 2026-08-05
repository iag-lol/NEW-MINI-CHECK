import { useState, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, Search, Filter, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonCard } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { WeekSelector } from '@/components/week-selector'
import { useWeekFilter } from '@/hooks/use-week-filter'

type TableName = keyof Database['public']['Tables']
type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row']

interface Column<T> {
  label: string
  className?: string
  render: (row: T) => ReactNode
}

export interface StatConfig {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export interface FilterConfig {
  key: string
  label: string
  type: 'select' | 'search' | 'date'
  options?: Array<{ label: string; value: string }>
  placeholder?: string
}

export interface ChartConfig {
  title: string
  component: ReactNode
}

interface ModuleLayoutProps<T extends TableName> {
  table: T
  title: string
  description: string
  icon?: React.ComponentType<{ className?: string }>
  columns: Column<TableRow<T>>[]
  getStats: (data: TableRow<T>[]) => StatConfig[]
  filters?: FilterConfig[]
  charts?: ChartConfig[]
  getCharts?: (data: TableRow<T>[]) => ChartConfig[]
  searchFields?: (keyof TableRow<T>)[]
  queryLimit?: number | null
  tableScrollClassName?: string
  disableWeekFilter?: boolean
}

export const ModuleLayout = <T extends TableName>({
  table,
  title,
  description,
  icon: Icon,
  columns,
  getStats,
  filters = [],
  charts = [],
  getCharts,
  searchFields = [],
  queryLimit = 200,
  tableScrollClassName,
  disableWeekFilter = false,
}: ModuleLayoutProps<T>) => {
  const { weekInfo } = useWeekFilter()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['module', table, queryLimit ?? 'all', disableWeekFilter ? 'no-filter' : weekInfo.startISO, disableWeekFilter ? 'no-filter' : weekInfo.endISO],
    queryFn: async () => {
      let baseQuery = supabase
        .from(table)
        .select('*')

      // Only apply week filter if not disabled
      if (!disableWeekFilter) {
        baseQuery = baseQuery
          .gte('created_at', weekInfo.startISO)
          .lte('created_at', weekInfo.endISO)
      }

      baseQuery = baseQuery.order('created_at', { ascending: false })

      const { data, error } = queryLimit ? await baseQuery.limit(queryLimit) : await baseQuery
      if (error) throw error
      return (data ?? []) as unknown as TableRow<T>[]
    },
  })

  // Calculate stats
  const stats = useMemo(() => {
    if (!data) return []
    return getStats(data)
  }, [data, getStats])

  // Filter data
  const filteredData = useMemo(() => {
    if (!data) return []

    let filtered = data

    // Apply search
    if (searchQuery.trim() && searchFields.length > 0) {
      filtered = filtered.filter((row) => {
        return searchFields.some((field) => {
          const value = row[field]
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(searchQuery.toLowerCase())
        })
      })
    }

    // Apply filters
    Object.entries(filterValues).forEach(([key, value]) => {
      if (value && value !== 'TODOS') {
        filtered = filtered.filter((row) => {
          const rowValue = row[key as keyof TableRow<T>]
          return String(rowValue) === value
        })
      }
    })

    return filtered
  }, [data, searchQuery, filterValues, searchFields])
  const chartConfigs = useMemo(() => {
    if (getCharts) {
      return getCharts(filteredData)
    }
    return charts ?? []
  }, [filteredData, getCharts, charts])

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Header */}
      <div className="glass-panel relative overflow-hidden rounded-[var(--app-radius-lg)] p-3 sm:p-5">
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-brand-400/12 blur-3xl" />
        <div className="relative flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-white/25 bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-[0_10px_22px_-14px_var(--color-brand-600)] sm:h-12 sm:w-12 sm:rounded-[17px]">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
                {table}
              </p>
              <h1 className="truncate text-[17px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">{title}</h1>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400 sm:text-sm sm:leading-5">{description}</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            {!disableWeekFilter && <WeekSelector />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="w-full gap-2 sm:w-auto"
              disabled={isFetching}
            >
              <RefreshCcw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {isFetching && !data ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <StatCard
              key={index}
              title={stat.title}
              value={stat.value}
              description={stat.description}
              icon={stat.icon}
              trend={stat.trend}
              variant={stat.variant}
            />
          ))}
        </div>
      )}

      {/* Filters and Search */}
      {(filters.length > 0 || searchFields.length > 0) && (
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Filtros y búsqueda
                </span>
              </div>
              {filters.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                  aria-expanded={showFilters}
                >
                  {showFilters ? 'Ocultar' : 'Mostrar'} filtros
                </Button>
              )}
            </div>

            {/* Search Bar */}
            {searchFields.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}

            {/* Filter Dropdowns */}
            {showFilters && filters.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"
              >
                {filters.map((filter) => (
                  <div key={filter.key}>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {filter.label}
                    </label>
                    <select
                      value={filterValues[filter.key] || ''}
                      onChange={(e) =>
                        setFilterValues((prev) => ({ ...prev, [filter.key]: e.target.value }))
                      }
                      className="glass-control h-11 w-full rounded-xl border px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-300/20 dark:text-white"
                    >
                      <option value="">Todos</option>
                      {filter.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterValues({})
                      setSearchQuery('')
                    }}
                    className="w-full"
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </Card>
      )}

      {/* Charts */}
      {chartConfigs.length > 0 && (
        <div className={cn('grid gap-4', chartConfigs.length === 1 ? 'grid-cols-1' : 'md:grid-cols-2')}>
          {chartConfigs.map((chart, index) => (
            <Card key={index} className="p-6">
              <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                {chart.title}
              </h3>
              {chart.component}
            </Card>
          ))}
        </div>
      )}

      {/* Listado en tarjetas: la vista de móvil.
          Una tabla de 8 columnas en una pantalla de 390 px sólo se puede leer
          arrastrando de lado, y así se pierde de vista a qué bus pertenece
          cada dato. En tarjetas cada registro se lee entero de una vez. */}
      <div className="space-y-2 lg:hidden">
        {filteredData?.map((row) => {
          const rowKey = 'id' in row && row.id ? (row.id as string) : JSON.stringify(row)
          const [encabezado, ...resto] = columns
          return (
            <Card key={rowKey} className="!p-0">
              <div className="flex items-center justify-between gap-2 border-b border-white/50 px-3 py-2.5 dark:border-white/[0.06]">
                <div className="min-w-0 text-[13px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
                  {encabezado.render(row)}
                </div>
              </div>
              <dl className="divide-y divide-white/40 dark:divide-white/[0.04]">
                {resto.map((column) => (
                  <div
                    key={column.label}
                    className="flex items-start justify-between gap-3 px-3 py-2"
                  >
                    <dt className="shrink-0 pt-px text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                      {column.label}
                    </dt>
                    <dd className="min-w-0 flex-1 text-right text-[12px] text-slate-700 dark:text-slate-200">
                      {column.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          )
        })}

        {/* Mientras llega la primera consulta no se afirma que no hay nada */}
        {isFetching && !data && (
          <Card className="py-10 text-center text-[12.5px] text-slate-400">
            Cargando registros...
          </Card>
        )}

        {!isFetching && filteredData?.length === 0 && (
          <Card className="py-10 text-center text-[12.5px] text-slate-400">
            {data?.length === 0
              ? 'No hay registros para mostrar todavía.'
              : 'No se encontraron resultados con los filtros aplicados.'}
          </Card>
        )}
      </div>

      {/* Tabla: a partir de pantalla grande, donde sí caben las columnas */}
      <Card className="hidden overflow-hidden p-0 lg:block">
        <div className={cn(tableScrollClassName ?? 'max-h-[60vh]', 'overflow-auto')}>
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-900">
            <thead className="sticky top-0 z-10 bg-white/85 text-left uppercase tracking-wide text-slate-500 backdrop-blur-xl dark:bg-slate-900/85">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className={cn('whitespace-nowrap px-4 py-3.5 text-[11px] font-bold tracking-[0.08em] sm:px-6 sm:py-4', column.className)}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70 bg-white/25 dark:divide-slate-900/70 dark:bg-slate-950/20">
              {filteredData?.map((row) => {
                const rowKey = 'id' in row && row.id ? (row.id as string) : JSON.stringify(row)
                return (
                  <tr
                    key={rowKey}
                    className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  >
                    {columns.map((column) => (
                      <td key={column.label} className={cn('px-4 py-3.5 sm:px-6 sm:py-4', column.className)}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {filteredData?.length === 0 && (
                <tr>
                  <td
                    className="px-6 py-12 text-center text-slate-400"
                    colSpan={columns.length}
                  >
                    {data?.length === 0
                      ? 'No hay registros para mostrar todavía. Las revisiones completadas serán visibles al instante gracias a Supabase Realtime.'
                      : 'No se encontraron resultados con los filtros aplicados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
