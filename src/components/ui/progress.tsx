import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  className?: string
}

export const Progress = ({ value, className }: ProgressProps) => (
  <div
    className={cn(
      'h-2 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/80',
      className
    )}
  >
    <div
      className="h-full rounded-full bg-brand-500 transition-[width]"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
)
