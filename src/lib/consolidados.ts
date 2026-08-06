import ExcelJS from 'exceljs'
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
  // La consulta es genérica sobre varias tablas: TypeScript sólo ve la
  // unión de todas sus filas y no puede estrecharla al T concreto
  ;((data as unknown as T[]) ?? []).forEach((row) => {
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
//    SOLO flota Volvo (los Scania no llevan Mobileye)
//    Sensores traseros (ART) solo aplican a buses articulados
// ============================================================

const buildMobileyeWorkbook = (flota: FlotaRow[], mobileyes: Map<string, MobileyeRow>) => {
  const flotaVolvo = flota.filter((bus) => (bus.marca ?? '').toUpperCase().includes('VOLVO'))
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

  flotaVolvo.forEach((bus, index) => {
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

// La parte de datos (pegado, fusión y almacenamiento) vive en su propio
// módulo para que el diálogo pueda usarla sin arrastrar ExcelJS.
export {
  loadRevisionSemanal,
  parseTablaWeb,
  mergeRevisionSemanal,
} from '@/lib/consolidados-datos'
import { mergeRevisionSemanal, parseTablaWeb } from '@/lib/consolidados-datos'
export type {
  RevisionSemanalItem,
  ParsedWebRow,
  MergeStats,
} from '@/lib/consolidados-datos'
import type { MergeStats, RevisionSemanalItem } from '@/lib/consolidados-datos'

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
