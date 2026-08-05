import { useQuery } from '@tanstack/react-query'
import dayjs, { getIsoWeekYear } from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'

const DIAS_HISTORIAL = 90
const DIAS_GRAFICO = 14

export const semanaIsoActual = () =>
  `${getIsoWeekYear()}-W${String(dayjs().isoWeek()).padStart(2, '0')}`

interface RevisionResumen {
  id: string
  created_at: string
  bus_ppu: string
  terminal_reportado: string
  estado_bus: 'OPERATIVO' | 'EN_PANNE'
  semana_iso: string
}

export interface DiaActividad {
  fecha: string
  etiqueta: string
  revisiones: number
  esHoy: boolean
}

export interface MisEstadisticas {
  total: number
  hoy: number
  semana: number
  semanaAnterior: number
  variacionSemanal: number | null
  mes: number
  promedioDiario: number
  busesUnicos: number
  operativos: number
  enPanne: number
  tasaOperativa: number
  racha: number
  mejorDia: { fecha: string; cantidad: number } | null
  terminalPrincipal: { nombre: string; cantidad: number } | null
  serie: DiaActividad[]
  primeraRevision: string | null
}

/** Días consecutivos con al menos una revisión, contando hacia atrás. */
const calcularRacha = (diasConActividad: Set<string>) => {
  let racha = 0
  let cursor = dayjs().startOf('day')

  // Si aún no ha revisado hoy, la racha sigue viva desde ayer: el día no
  // ha terminado y cortarla sería castigar al inspector de turno de tarde.
  if (!diasConActividad.has(cursor.format('YYYY-MM-DD'))) {
    cursor = cursor.subtract(1, 'day')
  }

  while (diasConActividad.has(cursor.format('YYYY-MM-DD'))) {
    racha += 1
    cursor = cursor.subtract(1, 'day')
  }

  return racha
}

/** Métricas personales del inspector sobre sus últimas revisiones. */
export const useMisEstadisticas = (rut: string | undefined) =>
  useQuery({
    queryKey: ['mis-revisiones', rut],
    enabled: Boolean(rut),
    staleTime: 60_000,
    queryFn: async (): Promise<MisEstadisticas> => {
      const desde = dayjs().subtract(DIAS_HISTORIAL, 'day').startOf('day')

      const { data, error } = await supabase
        .from('revisiones')
        .select('id, created_at, bus_ppu, terminal_reportado, estado_bus, semana_iso')
        .eq('inspector_rut', rut!)
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false })

      if (error) throw error

      const revisiones = (data ?? []) as RevisionResumen[]

      const hoyKey = dayjs().format('YYYY-MM-DD')
      const semanaActual = semanaIsoActual()
      const semanaPrevia = `${getIsoWeekYear(dayjs().subtract(1, 'week'))}-W${String(
        dayjs().subtract(1, 'week').isoWeek()
      ).padStart(2, '0')}`
      const inicioMes = dayjs().startOf('month')

      const porDia = new Map<string, number>()
      const porTerminal = new Map<string, number>()
      const buses = new Set<string>()
      let hoy = 0
      let semana = 0
      let semanaAnterior = 0
      let mes = 0
      let operativos = 0

      revisiones.forEach((revision) => {
        const fecha = dayjs(revision.created_at)
        const clave = fecha.format('YYYY-MM-DD')

        porDia.set(clave, (porDia.get(clave) ?? 0) + 1)
        porTerminal.set(
          revision.terminal_reportado,
          (porTerminal.get(revision.terminal_reportado) ?? 0) + 1
        )
        buses.add(revision.bus_ppu)

        if (clave === hoyKey) hoy += 1
        if (revision.semana_iso === semanaActual) semana += 1
        if (revision.semana_iso === semanaPrevia) semanaAnterior += 1
        if (!fecha.isBefore(inicioMes)) mes += 1
        if (revision.estado_bus === 'OPERATIVO') operativos += 1
      })

      const serie: DiaActividad[] = Array.from({ length: DIAS_GRAFICO }, (_, index) => {
        const dia = dayjs().subtract(DIAS_GRAFICO - 1 - index, 'day')
        const clave = dia.format('YYYY-MM-DD')
        return {
          fecha: clave,
          etiqueta: dia.format('DD/MM'),
          revisiones: porDia.get(clave) ?? 0,
          esHoy: clave === hoyKey,
        }
      })

      const mejorDiaEntry = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0]
      const terminalEntry = [...porTerminal.entries()].sort((a, b) => b[1] - a[1])[0]

      // Promedio sobre los días transcurridos desde su primera revisión, no
      // sobre los 90 del rango: un inspector nuevo no debe salir penalizado.
      const primera = revisiones.at(-1)?.created_at ?? null
      const diasActivos = primera
        ? Math.max(1, dayjs().startOf('day').diff(dayjs(primera).startOf('day'), 'day') + 1)
        : 1

      return {
        total: revisiones.length,
        hoy,
        semana,
        semanaAnterior,
        variacionSemanal:
          semanaAnterior > 0
            ? Math.round(((semana - semanaAnterior) / semanaAnterior) * 100)
            : null,
        mes,
        promedioDiario: Math.round((revisiones.length / diasActivos) * 10) / 10,
        busesUnicos: buses.size,
        operativos,
        enPanne: revisiones.length - operativos,
        tasaOperativa: revisiones.length
          ? Math.round((operativos / revisiones.length) * 100)
          : 0,
        racha: calcularRacha(new Set(porDia.keys())),
        mejorDia: mejorDiaEntry
          ? { fecha: mejorDiaEntry[0], cantidad: mejorDiaEntry[1] }
          : null,
        terminalPrincipal: terminalEntry
          ? { nombre: terminalEntry[0], cantidad: terminalEntry[1] }
          : null,
        serie,
        primeraRevision: primera,
      }
    },
  })

export interface PuestoRanking {
  posicion: number
  total: number
  revisiones: number
  lider: number
}

/** Posición del inspector en la semana en curso frente al resto del equipo. */
export const useMiRanking = (rut: string | undefined) =>
  useQuery({
    queryKey: ['mi-ranking', rut, semanaIsoActual()],
    enabled: Boolean(rut),
    staleTime: 60_000,
    queryFn: async (): Promise<PuestoRanking | null> => {
      const { data, error } = await supabase
        .from('revisiones')
        .select('inspector_rut')
        .eq('semana_iso', semanaIsoActual())

      if (error) throw error

      const conteo = new Map<string, number>()
      ;(data ?? []).forEach((fila) => {
        const clave = (fila as { inspector_rut: string }).inspector_rut
        conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
      })

      if (conteo.size === 0) return null

      const ordenado = [...conteo.entries()].sort((a, b) => b[1] - a[1])
      const indice = ordenado.findIndex(([clave]) => clave === rut)
      if (indice === -1) {
        return {
          posicion: ordenado.length + 1,
          total: ordenado.length + 1,
          revisiones: 0,
          lider: ordenado[0][1],
        }
      }

      return {
        posicion: indice + 1,
        total: ordenado.length,
        revisiones: ordenado[indice][1],
        lider: ordenado[0][1],
      }
    },
  })
