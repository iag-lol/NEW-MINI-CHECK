import { useState, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCcw, Search, Filter } from 'lucide-react'
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
  icon?: any
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
}: ModuleLayoutProps<T>) => {
  const { weekInfo } = useWeekFilter()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['module', table, queryLimit ?? 'all', weekInfo.startISO, weekInfo.endISO],
    queryFn: async () => {
      const baseQuery = supabase
        .from(table)
        .select('*')
        .gte('created_at', weekInfo.startISO)
        .lte('created_at', weekInfo.endISO)
        .order('created_at', { ascending: false })
      const { data, error} = queryLimit ? await baseQuery.limit(queryLimit) : await baseQuery
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
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-r from-brand-50/50 to-purple-50/30 p-8 dark:border-slate-800 dark:from-brand-950/30 dark:to-purple-950/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDk5LDEwMiwyNDEsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            {Icon && (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 text-white shadow-lg shadow-brand-500/20">
                <Icon className="h-7 w-7" />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600 dark:text-brand-400">
                {table}
              </p>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">{title}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WeekSelector />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        <Card className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
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
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
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

      {/* Data Table */}
      <Card className="p-0">
        <div className={cn(tableScrollClassName ?? 'max-h-[60vh]', 'overflow-auto')}>
          <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-900">
              <thead className="sticky top-0 z-10 bg-slate-50/95 text-left uppercase tracking-wide text-slate-500 backdrop-blur-sm dark:bg-slate-900/95">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.label}
                      className={cn('px-6 py-4 font-semibold whitespace-nowrap', column.className)}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70 bg-white dark:divide-slate-900/70 dark:bg-slate-950">
                {filteredData?.map((row) => {
                  const rowKey = 'id' in row && row.id ? (row.id as string) : JSON.stringify(row)
                  return (
                    <tr
                      key={rowKey}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    >
                      {columns.map((column) => (
                        <td key={column.label} className={cn('px-6 py-4', column.className)}>
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
