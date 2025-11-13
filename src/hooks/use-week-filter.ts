import { useMemo } from 'react'
import dayjs from '@/lib/dayjs'
import { useWeekStore, type WeekInfo } from '@/store/week-store'

export function useWeekFilter() {
  const { selectedDate, goToPreviousWeek, goToNextWeek, goToCurrentWeek, getWeekInfo } =
    useWeekStore()

  const weekInfo = useMemo((): WeekInfo => getWeekInfo(), [selectedDate])

  const canGoNext = useMemo(() => {
    const nextWeek = selectedDate.add(1, 'week')
    const currentWeekStart = dayjs().isoWeekday(1).startOf('day')
    return nextWeek.isBefore(currentWeekStart) || nextWeek.isSame(currentWeekStart, 'week')
  }, [selectedDate])

  return {
    weekInfo,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    canGoNext,
  }
}
