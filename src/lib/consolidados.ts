import ExcelJS from 'exceljs'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type FlotaRow = Tables<'flota'>
type TagRow = Tables<'tags'>
type CamarasRow = Tables<'camaras'>
type MobileyeRow = Tables<'mobileye'>

// ============================================================
// CONSOLIDADOS SEMANALES
// Genera 4 archivos XLSX con el formato oficial del consolidado:
//   1. CAMARAS para CONSOLIDADO.xlsx
//   2. MOBILEYES para CONSOLIDADO.xlsx
//   3. TAG para CONSOLIDADO.xlsx
//   4. Revision Semanal Recursos Semana N.xlsx
// ============================================================

// ---------- Paleta corporativa ----------
const COLOR_NAVY = 'FF1F3864' // Azul marino encabezados
const COLOR_BROWN = 'FF843C0C' // Café/rojo oscuro columnas de módulo (Mobileye)
const COLOR_YELLOW = 'FFFFFF00' // Amarillo encabezado TAG
const COLOR_GREEN_SOFT = 'FFEBF1E6' // Verde claro filas Revisión Semanal
const COLOR_RED_SOFT = 'FFFDE2E2' // Fondo suave para problemas
const COLOR_ZEBRA = 'FFF3F6FB' // Zebra suave azulada
const COLOR_BORDER = 'FFB8C2D9'

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR_BORDER } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } },
}

const styleHeaderRow = (
  sheet: ExcelJS.Worksheet,
  options?: { fill?: string; font?: Partial<ExcelJS.Font>; from?: number; to?: number }
) => {
  const headerRow = sheet.getRow(1)
  headerRow.height = 34
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const from = options?.from ?? 1
    const to = options?.to ?? sheet.columnCount
    if (col < from || col > to) return
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options?.fill ?? COLOR_NAVY } }
    cell.font = {
      bold: true,
      size: 11,
      color: { argb: 'FFFFFFFF' },
      name: 'Calibri',
      ...options?.font,
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'medium', color: { argb: 'FF404040' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    }
  })
}

const styleDataRow = (row: ExcelJS.Row, zebra: boolean) => {
  row.height = 20
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
    cell.font = { size: 10, name: 'Calibri', ...cell.font }
    if (zebra && !cell.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ZEBRA } }
    }
  })
}

const finishSheet = (sheet: ExcelJS.Worksheet) => {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  if (sheet.rowCount >= 1 && sheet.columnCount >= 1) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(sheet.rowCount, 1), column: sheet.columnCount },
    }
  }
}

const downloadWorkbook = async (workbook: ExcelJS.Workbook, filename: string) => {
  workbook.creator = 'Mini-Check'
  workbook.created = new Date()
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- Datos base ----------

const fetchFlota = async (): Promise<FlotaRow[]> => {
  const { data } = await supabase
    .from('flota')
    .select('*')
    .limit(10000)
    .order('terminal', { ascending: true })
    .order('numero_interno', { ascending: true })
  return (data as FlotaRow[]) ?? []
}

/**
 * Última fila por PPU de una tabla de módulo.
 * Si se entrega startISO solo considera la semana; si no, todo el histórico hasta endISO.
 */
const fetchLatestPorBus = async <T extends { bus_ppu: string; created_at: string }>(
  table: 'tags' | 'camaras' | 'mobileye',
  endISO: string,
  startISO?: string
): Promise<Map<string, T>> => {
  let query = supabase
    .from(table)
    .select('*')
    .lte('created_at', endISO)
    .order('created_at', { ascending: false })
    .limit(10000)
  if (startISO) query = query.gte('created_at', startISO)
  const { data } = await query
  const latest = new Map<string, T>()
  ;((data as T[]) ?? []).forEach((row) => {
    if (!latest.has(row.bus_ppu)) latest.set(row.bus_ppu, row)
  })
  return latest
}

const ART_REGEX = /UA|LEA$|ARTIC/i
const esArticulado = (modelo: string | null | undefined) => ART_REGEX.test(modelo ?? '')

const asignacionDe = (bus: FlotaRow) => `US6 ${bus.terminal.toUpperCase()}`

const numeroInterno = (bus: FlotaRow): number | string => {
  const parsed = Number(bus.numero_interno)
  return Number.isFinite(parsed) ? parsed : bus.numero_interno
}

// ============================================================
// 1) CAMARAS para CONSOLIDADO
//    0 = sin dato / sin problema · 1 = con problema detectado
// ============================================================

const buildCamarasWorkbook = (flota: FlotaRow[], camaras: Map<string, CamarasRow>) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('CAMARAS', {
    properties: { defaultRowHeight: 20 },
  })

  sheet.columns = [
    { header: 'N°', key: 'n', width: 8 },
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 18 },
    { header: 'ASIGNACION', key: 'asignacion', width: 20 },
    { header: 'MODELO CHASIS', key: 'modelo', width: 16 },
    { header: 'MARCA', key: 'marca', width: 12 },
    { header: 'AÑO', key: 'anio', width: 8 },
    { header: 'MONITOR CAMARA', key: 'monitor', width: 12 },
    { header: 'CAMARA FRONTAL', key: 'frontal', width: 12 },
    { header: 'CAMARA CABINA', key: 'cabina', width: 12 },
    { header: 'CAMARAS INTERIOR', key: 'interior', width: 12 },
    { header: 'CAMARA TRASERA', key: 'trasera', width: 12 },
    { header: 'OBSERVACION', key: 'observacion', width: 40 },
  ]
  styleHeaderRow(sheet)

  const detalleProblema = (detalle: CamarasRow['detalle'], keys: string[]): 0 | 1 => {
    if (!detalle || typeof detalle !== 'object') return 0
    const record = detalle as Record<string, unknown>
    for (const key of keys) {
      if (key in record) return record[key] === false ? 1 : 0
    }
    return 0
  }

  flota.forEach((bus, index) => {
    const cam = camaras.get(bus.ppu)
    const detalle = cam?.detalle ?? null

    const row = sheet.addRow({
      n: numeroInterno(bus),
      ppu: bus.ppu,
      terminal: bus.terminal.toUpperCase(),
      asignacion: asignacionDe(bus),
      modelo: bus.modelo,
      marca: bus.marca,
      anio: bus.anio,
      monitor: cam && cam.monitor_estado !== 'FUNCIONA' ? 1 : 0,
      frontal: detalleProblema(detalle, ['camDelantera', 'cam_delantera']),
      cabina: detalleProblema(detalle, ['camCabina', 'cam_cabina']),
      interior: detalleProblema(detalle, ['camInteriores', 'cam_interiores']),
      trasera: detalleProblema(detalle, ['camTrasera', 'cam_trasera']),
      observacion: cam?.observacion ?? '',
    })

    styleDataRow(row, index % 2 === 1)

    // Columnas 0/1 centradas; los "1" (problema) destacados en rojo
    for (let col = 8; col <= 12; col += 1) {
      const cell = row.getCell(col)
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (cell.value === 1) {
        cell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FFB91C1C' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_RED_SOFT } }
      } else {
        cell.font = { size: 10, name: 'Calibri', color: { argb: 'FF64748B' } }
      }
    }
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(2).font = { size: 10, name: 'Calibri', bold: true }
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  finishSheet(sheet)
  return workbook
}

// ============================================================
// 2) MOBILEYES para CONSOLIDADO
//    Sensores traseros (ART) solo aplican a buses articulados
// ============================================================

const buildMobileyeWorkbook = (flota: FlotaRow[], mobileyes: Map<string, MobileyeRow>) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('MOBILEYE', {
    properties: { defaultRowHeight: 20 },
  })

  sheet.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'MODELO', key: 'modelo', width: 14 },
    { header: 'MARCA', key: 'marca', width: 12 },
    { header: 'AÑO', key: 'anio', width: 8 },
    { header: 'TERMINAL', key: 'terminal', width: 18 },
    { header: 'TIPO', key: 'tipo', width: 14 },
    { header: 'ALERTA IZQ', key: 'alerta_izq', width: 12 },
    { header: 'ALERTA DER', key: 'alerta_der', width: 12 },
    { header: 'CONSOLA', key: 'consola', width: 12 },
    { header: 'SENSOR FRONTAL', key: 'sensor_frontal', width: 13 },
    { header: 'SENSOR IZQ', key: 'sensor_izq', width: 12 },
    { header: 'SENSOR DER', key: 'sensor_der', width: 12 },
    { header: 'SENSOR TRASER IZQ (ART)', key: 'sensor_tras_izq', width: 15 },
    { header: 'SENSOR TRASER DER (ART)', key: 'sensor_tras_der', width: 15 },
    { header: 'OBSERVACION', key: 'observacion', width: 36 },
  ]
  // Identificación en azul marino, columnas del módulo en café
  styleHeaderRow(sheet, { from: 1, to: 6 })
  styleHeaderRow(sheet, { fill: COLOR_BROWN, from: 7, to: 15 })

  const etiqueta = (value: boolean | null | undefined) => {
    if (value === true) return 'TIENE'
    if (value === false) return 'DAÑADO'
    return 'SIN DATO'
  }

  flota.forEach((bus, index) => {
    const mob = mobileyes.get(bus.ppu)
    const articulado = esArticulado(bus.modelo)

    const row = sheet.addRow({
      ppu: bus.ppu,
      modelo: bus.modelo,
      marca: bus.marca,
      anio: bus.anio,
      terminal: bus.terminal.toUpperCase(),
      tipo: articulado ? 'ARTICULADO' : 'RIGIDO',
      alerta_izq: etiqueta(mob?.alerta_izq),
      alerta_der: etiqueta(mob?.alerta_der),
      consola: etiqueta(mob?.consola),
      sensor_frontal: etiqueta(mob?.sensor_frontal),
      sensor_izq: etiqueta(mob?.sensor_izq),
      sensor_der: etiqueta(mob?.sensor_der),
      sensor_tras_izq: articulado ? 'SIN DATO' : 'NO APLICA',
      sensor_tras_der: articulado ? 'SIN DATO' : 'NO APLICA',
      observacion: mob?.observacion ?? '',
    })

    styleDataRow(row, index % 2 === 1)

    for (let col = 7; col <= 14; col += 1) {
      const cell = row.getCell(col)
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (cell.value === 'DAÑADO') {
        cell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FFB91C1C' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_RED_SOFT } }
      } else if (cell.value === 'NO APLICA' || cell.value === 'SIN DATO') {
        cell.font = { size: 10, name: 'Calibri', italic: true, color: { argb: 'FF94A3B8' } }
      }
    }
    row.getCell(1).font = { size: 10, name: 'Calibri', bold: true }
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  finishSheet(sheet)
  return workbook
}

// ============================================================
// 3) TAG para CONSOLIDADO
// ============================================================

const buildTagWorkbook = (flota: FlotaRow[], tags: Map<string, TagRow>) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('TAG', {
    properties: { defaultRowHeight: 20 },
  })

  sheet.columns = [
    { header: 'N°', key: 'n', width: 8 },
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'TAG', key: 'tag', width: 14 },
    { header: 'SERIE TAG', key: 'serie', width: 20 },
    { header: 'OBSERVACION', key: 'observacion', width: 40 },
  ]
  styleHeaderRow(sheet, {
    fill: COLOR_YELLOW,
    font: { color: { argb: 'FF000000' }, bold: true },
  })

  flota.forEach((bus, index) => {
    const tag = tags.get(bus.ppu)

    const row = sheet.addRow({
      n: numeroInterno(bus),
      ppu: bus.ppu,
      tag: tag ? (tag.tiene ? 'TIENE' : 'NO TIENE') : 'SIN DATO',
      serie: tag?.tiene && tag.serie ? tag.serie : '',
      observacion: tag?.observacion ?? '',
    })

    styleDataRow(row, index % 2 === 1)

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    row.getCell(2).font = { size: 10, name: 'Calibri', bold: true }
    const tagCell = row.getCell(3)
    tagCell.alignment = { horizontal: 'center', vertical: 'middle' }
    if (tagCell.value === 'NO TIENE') {
      tagCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FFB91C1C' } }
      tagCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_RED_SOFT } }
    } else if (tagCell.value === 'SIN DATO') {
      tagCell.font = { size: 10, name: 'Calibri', italic: true, color: { argb: 'FF94A3B8' } }
    }
    // Serie como texto para no perder ceros a la izquierda
    row.getCell(4).numFmt = '@'
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
  })

  finishSheet(sheet)
  return workbook
}

// ============================================================
// 4) REVISION SEMANAL RECURSOS
//    Se alimenta pegando la tabla de la web (buses fuera de servicio):
//    las PPU existentes actualizan fecha/días y las nuevas se agregan.
// ============================================================

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

const buildRevisionSemanalWorkbook = (items: RevisionSemanalItem[], weekLabel: string) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(`Semana ${weekLabel}`.slice(0, 31), {
    properties: { defaultRowHeight: 22 },
  })

  sheet.columns = [
    { header: 'TERMINAL', key: 'terminal', width: 16 },
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'N°BUS', key: 'nbus', width: 10 },
    { header: 'MODELO BUS', key: 'modelo', width: 14 },
    { header: 'EVENTO', key: 'evento', width: 20 },
    { header: 'Terminal Tráfico', key: 'trafico', width: 22 },
    { header: 'UNIDAD', key: 'unidad', width: 10 },
    { header: 'FECHA', key: 'fecha', width: 14 },
    { header: 'DIAS FUERA DE SERVICIO', key: 'dias', width: 13 },
    { header: 'OBSERVACION', key: 'observacion', width: 28 },
    { header: 'FOTO', key: 'foto', width: 18 },
  ]
  styleHeaderRow(sheet)

  items.forEach((item) => {
    const row = sheet.addRow({
      terminal: item.terminal,
      ppu: item.ppu,
      nbus: Number.isFinite(Number(item.nBus)) && item.nBus !== '' ? Number(item.nBus) : item.nBus,
      modelo: item.modeloBus,
      evento: item.evento,
      trafico: item.terminalTrafico,
      unidad: item.unidad,
      fecha: item.fecha,
      dias: item.dias ?? '',
      observacion: item.observacion,
      foto: 'SIN FOTO',
    })

    row.height = 42
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = thinBorder
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      // Verde claro en las columnas de datos vivos, como el consolidado original
      if ([2, 6, 8, 9, 10, 11].includes(col)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GREEN_SOFT } }
      }
    })

    row.getCell(2).font = { size: 10, name: 'Calibri', bold: true }
    row.getCell(11).font = { size: 12, name: 'Calibri', bold: true }
    const diasCell = row.getCell(9)
    if (typeof item.dias === 'number' && item.dias >= 30) {
      diasCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: 'FFB91C1C' } }
    }
  })

  finishSheet(sheet)
  return workbook
}

// ============================================================
// ORQUESTADOR: descarga los 4 archivos
// ============================================================

export interface ConsolidadosOptions {
  startISO: string
  endISO: string
  weekNumber: number
  year: number
  /** Tabla pegada desde la web para la Revisión Semanal (opcional) */
  pastedText?: string
}

export const exportConsolidadosSemanales = async (
  options: ConsolidadosOptions
): Promise<MergeStats> => {
  const { endISO, weekNumber, pastedText } = options

  const flota = await fetchFlota()

  // Siempre se rescata el último registro histórico de cada bus:
  // SIN DATO / 0 solo cuando no existe ningún registro en la base
  const [camaras, mobileyes, tags] = await Promise.all([
    fetchLatestPorBus<CamarasRow>('camaras', endISO),
    fetchLatestPorBus<MobileyeRow>('mobileye', endISO),
    fetchLatestPorBus<TagRow>('tags', endISO),
  ])

  const parsed = pastedText?.trim() ? parseTablaWeb(pastedText) : []
  const { items, stats } = mergeRevisionSemanal(parsed, flota)

  const camarasWb = buildCamarasWorkbook(flota, camaras)
  const mobileyeWb = buildMobileyeWorkbook(flota, mobileyes)
  const tagWb = buildTagWorkbook(flota, tags)
  const revisionWb = buildRevisionSemanalWorkbook(items, `${weekNumber}`)

  // Descarga secuencial con pausa para que el navegador no bloquee
  await downloadWorkbook(camarasWb, 'CAMARAS para CONSOLIDADO.xlsx')
  await wait(500)
  await downloadWorkbook(mobileyeWb, 'MOBILEYES para CONSOLIDADO.xlsx')
  await wait(500)
  await downloadWorkbook(tagWb, 'TAG para CONSOLIDADO.xlsx')
  await wait(500)
  await downloadWorkbook(revisionWb, `Revision Semanal Recursos Semana ${weekNumber}.xlsx`)

  return stats
}
