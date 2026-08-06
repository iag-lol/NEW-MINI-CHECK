import dayjs from '@/lib/dayjs'
import type { Tables } from '@/types/database'

type FlotaRow = Tables<'flota'>

/**
 * Datos de la Revisión Semanal de Recursos, sin ExcelJS.
 *
 * Vive separado de `consolidados.ts` por peso: el diálogo necesita
 * `parseTablaWeb` en cada pulsación de tecla para previsualizar lo pegado, y
 * tenerlo en el mismo módulo que ExcelJS obligaba a descargar 940 kB sólo
 * para abrir el diálogo. Aquí no hay ninguna dependencia pesada.
 */

export interface RevisionSemanalItem {
  ppu: string
  terminal: string
  nBus: string
  modeloBus: string
  evento: string
  terminalTrafico: string
  unidad: string
  fecha: string // DD/MM/YYYY
  dias: number | null
  observacion: string
  enUltimoPegado: boolean
  actualizadoEn: string // ISO
}

export interface ParsedWebRow {
  ppu: string
  evento: string
  nBus: string
  terminalTrafico: string
  unidad: string
  fecha: string
  dias: number | null
}

export interface MergeStats {
  total: number
  nuevas: string[]
  actualizadas: string[]
  sinAparecer: string[]
}

const STORAGE_KEY = 'consolidados:revision-semanal:v1'

const TERMINAL_ABREV: Record<string, string> = {
  ER: 'EL ROBLE',
  LR: 'LA REINA',
  MA: 'MARIA ANGELICA',
  ED: 'EL DESCANSO',
}

const expandirTerminalTrafico = (raw: string) => {
  const match = raw.trim().match(/^(US\s?\d+)\s+(.+)$/i)
  if (!match) return raw.trim().toUpperCase()
  const codigo = match[1].replace(/\s+/g, '').toUpperCase()
  const resto = match[2].trim().toUpperCase()
  return `${codigo} ${TERMINAL_ABREV[resto] ?? resto}`
}

export const loadRevisionSemanal = (): RevisionSemanalItem[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RevisionSemanalItem[]) : []
  } catch {
    return []
  }
}

const saveRevisionSemanal = (items: RevisionSemanalItem[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

const PPU_REGEX = /\b([A-Z]{4})[\s-]?(\d{2})\b/
const FECHA_REGEX = /\b(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\d{1,2}:\d{2})?\b/
const TRAFICO_REGEX = /\bUS\s?\d+\s+[A-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,})?\b/i
const UNIDAD_REGEX = /\bT(\d{2})\d{0,2}[a-z]?\b/

/**
 * Interpreta la tabla pegada desde la web. Tolera separadores por tab,
 * espacios múltiples y adornos como "[+]" o numeración inicial:
 * detecta cada campo por su forma (PPU, fecha, US6 XX, T13xx, días).
 */
export const parseTablaWeb = (text: string): ParsedWebRow[] => {
  const rows: ParsedWebRow[] = []
  const vistos = new Set<string>()

  text.split(/\r?\n/).forEach((line) => {
    const clean = line.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim()
    if (!clean) return

    const ppuMatch = clean.match(PPU_REGEX)
    if (!ppuMatch || ppuMatch.index === undefined) return
    const ppu = `${ppuMatch[1]}${ppuMatch[2]}`.toUpperCase()
    if (vistos.has(ppu)) return
    vistos.add(ppu)

    // EVENTO: texto antes de la PPU, sin numeración ni "[+]"
    const evento = clean
      .slice(0, ppuMatch.index)
      .replace(/\[\+\]/g, ' ')
      .replace(/^[\s\d.·•\-—|]+/, '')
      .replace(/[\s|]+$/, '')
      .trim()

    const resto = clean.slice(ppuMatch.index + ppuMatch[0].length)

    // N° BUS: primer número de 3-4 dígitos después de la PPU
    const nBusMatch = resto.match(/\b(\d{3,4})\b/)

    const traficoMatch = clean.match(TRAFICO_REGEX)
    const unidadMatch = clean.match(UNIDAD_REGEX)
    const fechaMatch = clean.match(FECHA_REGEX)

    // DIAS: primer entero de 1-4 dígitos después de la fecha
    let dias: number | null = null
    if (fechaMatch && fechaMatch.index !== undefined) {
      const trasFecha = clean.slice(fechaMatch.index + fechaMatch[0].length)
      const diasMatch = trasFecha.match(/\b(\d{1,4})\b/)
      if (diasMatch) dias = Number(diasMatch[1])
    }

    rows.push({
      ppu,
      evento: evento || 'PANNE',
      nBus: nBusMatch ? nBusMatch[1] : '',
      terminalTrafico: traficoMatch ? expandirTerminalTrafico(traficoMatch[0]) : '',
      unidad: unidadMatch ? `UN${unidadMatch[1]}` : '',
      fecha: fechaMatch ? dayjs(fechaMatch[1], 'DD/MM/YYYY').format('DD/MM/YYYY') : '',
      dias,
    })
  })

  return rows
}

const eventoNormalizado = (evento: string, dias: number | null) => {
  if (dias !== null && dias >= 30) return 'PANNE PROLONGADA'
  return evento.toUpperCase()
}

const terminalDesdeTrafico = (terminalTrafico: string) => {
  const nombre = terminalTrafico.replace(/^US\s?\d+\s*/i, '').trim()
  if (!nombre) return ''
  return nombre
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Fusiona lo pegado desde la web con la lista guardada:
 * - PPU existente → actualiza evento, fecha, días, unidad y terminal tráfico
 * - PPU nueva → se agrega enriquecida con datos de la flota
 * - PPU guardada que no aparece → se conserva y recalcula sus días
 */
export const mergeRevisionSemanal = (
  parsed: ParsedWebRow[],
  flota: FlotaRow[]
): { items: RevisionSemanalItem[]; stats: MergeStats } => {
  const items = loadRevisionSemanal()
  const porPpu = new Map(items.map((item) => [item.ppu, item]))
  const flotaPorPpu = new Map(flota.map((bus) => [bus.ppu, bus]))
  const ahora = dayjs().toISOString()

  const stats: MergeStats = { total: 0, nuevas: [], actualizadas: [], sinAparecer: [] }

  items.forEach((item) => {
    item.enUltimoPegado = false
  })

  parsed.forEach((row) => {
    const existente = porPpu.get(row.ppu)
    if (existente) {
      existente.evento = eventoNormalizado(row.evento, row.dias)
      existente.fecha = row.fecha || existente.fecha
      existente.dias = row.dias ?? existente.dias
      existente.terminalTrafico = row.terminalTrafico || existente.terminalTrafico
      existente.unidad = row.unidad || existente.unidad
      existente.enUltimoPegado = true
      existente.actualizadoEn = ahora
      stats.actualizadas.push(row.ppu)
    } else {
      const bus = flotaPorPpu.get(row.ppu)
      const nuevo: RevisionSemanalItem = {
        ppu: row.ppu,
        terminal: bus?.terminal ?? terminalDesdeTrafico(row.terminalTrafico),
        nBus: bus?.numero_interno ?? row.nBus,
        modeloBus: bus?.marca ?? '',
        evento: eventoNormalizado(row.evento, row.dias),
        terminalTrafico: row.terminalTrafico,
        unidad: row.unidad,
        fecha: row.fecha,
        dias: row.dias,
        observacion: '',
        enUltimoPegado: true,
        actualizadoEn: ahora,
      }
      items.push(nuevo)
      porPpu.set(row.ppu, nuevo)
      stats.nuevas.push(row.ppu)
    }
  })

  // Los que no aparecieron en el pegado conservan sus datos pero
  // se recalculan sus días fuera de servicio desde la fecha del evento
  items.forEach((item) => {
    if (!item.enUltimoPegado) {
      const fecha = dayjs(item.fecha, 'DD/MM/YYYY')
      if (fecha.isValid()) {
        item.dias = Math.max(dayjs().diff(fecha, 'day'), item.dias ?? 0)
      }
      if (parsed.length > 0) stats.sinAparecer.push(item.ppu)
    }
  })

  stats.total = items.length
  saveRevisionSemanal(items)
  return { items, stats }
}
