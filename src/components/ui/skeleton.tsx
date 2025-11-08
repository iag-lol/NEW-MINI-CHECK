import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Skeleton component for loading states
 * Provides a smooth shimmer animation effect
 */
export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%] dark:from-slate-800 dark:via-slate-700 dark:to-slate-800',
        className
      )}
      style={{
        animation: 'shimmer 2s ease-in-out infinite',
      }}
      {...props}
    />
  )
}

/**
 * Skeleton card for loading card content
 */
export const SkeletonCard = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/60 bg-white/95 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/80',
        className
      )}
      {...props}
    >
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

/**
 * Skeleton table for loading table content
 */
export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton chart for loading chart content
 */
export const SkeletonChart = ({ className }: { className?: string }) => {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-2">
        {[60, 80, 45, 90, 70, 55, 85, 50].map((height, index) => (
          <Skeleton key={index} className="flex-1" style={{ height: `${height}px` }} />
        ))}
      </div>
    </div>
  )
}
