import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/es'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import relativeTime from 'dayjs/plugin/relativeTime'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)
dayjs.extend(isoWeek)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('es')
dayjs.extend(relativeTime)

dayjs.tz.setDefault('America/Santiago')

// Delegado al plugin isoWeek: la aproximación manual anterior podía
// discrepar de .isoWeekYear() justo en las semanas que cruzan el año, y
// semana_iso es la clave con la que agrupan los reportes.
export const getIsoWeekYear = (value: Dayjs = dayjs()) => value.isoWeekYear()

export default dayjs
