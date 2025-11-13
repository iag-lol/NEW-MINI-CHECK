import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

interface WeekStore {
  selectedDate: Dayjs
  setSelectedDate: (date: Dayjs) => void
  goToPreviousWeek: () => void
  goToNextWeek: () => void
  goToCurrentWeek: () => void
  getWeekInfo: () => WeekInfo
}

const calculateWeekInfo = (selectedDate: Dayjs): WeekInfo => {
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
}

export const useWeekStore = create<WeekStore>()(
  persist(
    (set, get) => ({
      // Por defecto, semana actual
      selectedDate: dayjs(),

      setSelectedDate: (date: Dayjs) => set({ selectedDate: date }),

      goToPreviousWeek: () =>
        set((state) => ({
          selectedDate: state.selectedDate.subtract(1, 'week'),
        })),

      goToNextWeek: () => {
        const current = get().selectedDate
        const nextWeek = current.add(1, 'week')
        const currentWeekStart = dayjs().isoWeekday(1).startOf('day')

        if (nextWeek.isBefore(currentWeekStart) || nextWeek.isSame(currentWeekStart, 'week')) {
          set({ selectedDate: nextWeek })
        }
      },

      goToCurrentWeek: () => set({ selectedDate: dayjs() }),

      getWeekInfo: () => calculateWeekInfo(get().selectedDate),
    }),
    {
      name: 'week-filter-storage',
      // Solo persistir el ISO string de la fecha
      partialize: (state) => ({
        selectedDate: state.selectedDate.toISOString(),
      }),
      // Reconstruir el dayjs object al cargar
      onRehydrateStorage: () => (state) => {
        if (state && typeof state.selectedDate === 'string') {
          state.selectedDate = dayjs(state.selectedDate)
        }
      },
    }
  )
)
