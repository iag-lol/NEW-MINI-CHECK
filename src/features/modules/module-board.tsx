import { useQuery } from '@tanstack/react-query'
import { RefreshCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TableName = keyof Database['public']['Tables']

type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row']

interface Column<T> {
  label: string
  className?: string
  render: (row: T) => ReactNode
}

interface ModuleBoardProps<T extends TableName> {
  table: T
  title: string
  description: string
  columns: Column<TableRow<T>>[]
}

export const ModuleBoard = <T extends TableName>({
  table,
  title,
  description,
  columns,
}: ModuleBoardProps<T>) => {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['module', table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120)
      if (error) throw error
      return (data ?? []) as unknown as TableRow<T>[]
    },
  })

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-slate-100/70 px-8 py-6 dark:border-slate-900/60">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-500">
            {table}
          </p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
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
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-900">
            <thead className="bg-slate-50/80 text-left uppercase tracking-wide text-slate-500 dark:bg-slate-900/30">
              <tr>
                {columns.map((column) => (
                  <th key={column.label} className={cn('px-8 py-3 font-semibold whitespace-nowrap', column.className)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/70 dark:divide-slate-900/70">
              {data?.map((row) => {
                const rowKey =
                  'id' in row && row.id ? (row.id as string) : JSON.stringify(row)
                return (
                  <tr key={rowKey}>
                    {columns.map((column) => (
                      <td key={column.label} className={cn('px-8 py-4', column.className)}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {data?.length === 0 && (
                <tr>
                  <td className="px-8 py-8 text-center text-slate-400" colSpan={columns.length}>
                    No hay registros para mostrar todavía. Las revisiones completadas serán
                    visibles al instante gracias a Supabase Realtime.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>
    </Card>
  )
}
