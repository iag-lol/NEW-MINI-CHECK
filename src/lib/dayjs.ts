import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/es'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(isoWeek)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('es')
dayjs.extend(relativeTime)

dayjs.tz.setDefault('America/Santiago')

export const getIsoWeekYear = (value: Dayjs = dayjs()) => {
  const week = value.isoWeek()
  const month = value.month()
  const year = value.year()
  if (week === 1 && month === 11) return year + 1
  if (week >= 52 && month === 0) return year - 1
  return year
}

export default dayjs
