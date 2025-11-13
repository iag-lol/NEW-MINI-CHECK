import { useState, useMemo } from 'react'
import dayjs from '@/lib/dayjs'
import type { Dayjs } from 'dayjs'

export interface WeekInfo {
  weekNumber: number
  year: number
  start: Dayjs
  end: Dayjs
  startISO: string
  endISO: string
  label: string
  isCurrent: boolean
}

export function useWeekFilter() {
  // Empezamos en la semana actual
  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => dayjs())

  const weekInfo = useMemo((): WeekInfo => {
    // Inicio de semana (lunes)
    const start = selectedDate.isoWeekday(1).startOf('day')
    // Fin de semana (domingo)
    const end = start.add(6, 'day').endOf('day')

    const weekNumber = start.isoWeek()
    const year = start.isoWeekYear()
    const currentWeekNumber = dayjs().isoWeek()
    const currentYear = dayjs().isoWeekYear()
    const isCurrent = weekNumber === currentWeekNumber && year === currentYear

    const label = `${start.format('DD MMM')} - ${end.format('DD MMM YYYY')}`

    return {
      weekNumber,
      year,
      start,
      end,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label,
      isCurrent,
    }
  }, [selectedDate])

  const goToPreviousWeek = () => {
    setSelectedDate((prev: Dayjs) => prev.subtract(1, 'week'))
  }

  const goToNextWeek = () => {
    // No permitir avanzar más allá de la semana actual
    const nextWeek = selectedDate.add(1, 'week')
    const currentWeekStart = dayjs().isoWeekday(1).startOf('day')

    if (nextWeek.isBefore(currentWeekStart) || nextWeek.isSame(currentWeekStart, 'week')) {
      setSelectedDate(nextWeek)
    }
  }

  const goToCurrentWeek = () => {
    setSelectedDate(dayjs())
  }

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
