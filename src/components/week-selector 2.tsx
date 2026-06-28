import { Button } from '@/components/ui/button'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useWeekFilter } from '@/hooks/use-week-filter'

export const WeekSelector = () => {
  const { weekInfo, goToPreviousWeek, goToNextWeek, goToCurrentWeek, canGoNext } = useWeekFilter()

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <Button
        variant="ghost"
        size="sm"
        onClick={goToPreviousWeek}
        className="h-8 w-8 rounded-lg p-0"
        title="Semana anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex min-w-[200px] flex-col items-center px-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {weekInfo.label}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          Semana {weekInfo.weekNumber} de {weekInfo.year}
        </span>
        {!weekInfo.isCurrent && (
          <button
            onClick={goToCurrentWeek}
            className="text-xs text-brand-600 hover:underline dark:text-brand-400"
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
        className="h-8 w-8 rounded-lg p-0"
        title="Semana siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
