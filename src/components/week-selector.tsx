import { Button } from '@/components/ui/button'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useWeekFilter } from '@/hooks/use-week-filter'

export const WeekSelector = () => {
  const { weekInfo, goToPreviousWeek, goToNextWeek, goToCurrentWeek, canGoNext } = useWeekFilter()

  return (
    <div className="glass-control flex w-full min-w-0 items-center gap-1 rounded-2xl border p-1.5 sm:w-auto sm:gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={goToPreviousWeek}
        className="h-9 w-9 shrink-0 rounded-xl p-0"
        title="Semana anterior"
        aria-label="Ir a la semana anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex min-w-0 flex-1 flex-col items-center px-1 sm:min-w-[170px] sm:px-2">
        <div className="flex items-center gap-2">
          <Calendar className="hidden h-4 w-4 shrink-0 text-brand-500 min-[360px]:block" />
          <span className="truncate text-xs font-bold text-slate-900 dark:text-white sm:text-sm">
            {weekInfo.label}
          </span>
        </div>
        <span className="truncate text-[10px] text-slate-500 sm:text-xs">
          Semana {weekInfo.weekNumber} de {weekInfo.year}
        </span>
        {!weekInfo.isCurrent && (
          <button
            type="button"
            onClick={goToCurrentWeek}
            className="min-h-0 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400 sm:text-xs"
          >
            Ir a semana actual
          </button>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={goToNextWeek}
        disabled={!canGoNext}
        className="h-9 w-9 shrink-0 rounded-xl p-0"
        title="Semana siguiente"
        aria-label="Ir a la semana siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
