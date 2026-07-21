import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type FlotaRow = Tables<'flota'>
type RevisionRow = Tables<'revisiones'>
type TagRow = Tables<'tags'>
type CamarasRow = Tables<'camaras'>
type ExtintoresRow = Tables<'extintores'>
type MobileyeRow = Tables<'mobileye'>
type OdometroRow = Tables<'odometro'>
type RackRow = Tables<'rack'>
type PublicidadRow = Tables<'publicidad'>
type WifiRow = Tables<'wifi'>
type TicketRow = Tables<'tickets'>

// ============================================================
// REPORTE SEMANAL XLSX · DISEÑO PROFESIONAL
// Regla de oro: cada hoja muestra SIEMPRE el último registro
// disponible de cada bus. "SIN REGISTRO" aparece únicamente
// cuando no existe ni un dato en toda la base de datos.
// ============================================================

// ---------- Paleta ----------
const C = {
  navy: 'FF1F3864',
  navyLight: 'FF2E5395',
  white: 'FFFFFFFF',
  border: 'FFB8C2D9',
  subtitle: 'FF64748B',
  subtitleFill: 'FFEDF1F7',
  greenFill: 'FFDCFCE7',
  greenDark: 'FF166534',
  orangeFill: 'FFFFEDD5',
  orangeDark: 'FF9A3412',
  redFill: 'FFFEE2E2',
  redDark: 'FFB91C1C',
  amberFill: 'FFFEF3C7',
  amberDark: 'FF92400E',
  gray: 'FF94A3B8',
  slate: 'FF334155',
  blue: 'FF1D4ED8',
  blueFill: 'FFDBEAFE',
}

const HEADER_ROW = 3

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: C.border } },
  left: { style: 'thin', color: { argb: C.border } },
  bottom: { style: 'thin', color: { argb: C.border } },
  right: { style: 'thin', color: { argb: C.border } },
}

type EstadoDato = 'ACTUAL' | 'HISTORICO' | 'NUNCA'

interface SheetSpec {
  nombre: string
  titulo: string
  accent: string
  columnas: { header: string; key: string; width: number }[]
}

const colLetter = (n: number) => {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Crea una hoja con banner de título, leyenda y encabezado estilizado */
const crearHoja = (
  workbook: ExcelJS.Workbook,
  spec: SheetSpec,
  weekLabel: string
): ExcelJS.Worksheet => {
  const sheet = workbook.addWorksheet(spec.nombre, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    properties: { defaultRowHeight: 20, tabColor: { argb: spec.accent } },
  })

  sheet.columns = spec.columnas.map(({ key, width }) => ({ key, width }))
  const lastCol = colLetter(spec.columnas.length)

  // Fila 1 · Banner
  sheet.mergeCells(`A1:${lastCol}1`)
  const title = sheet.getCell('A1')
  title.value = spec.titulo
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
  title.font = { bold: true, size: 15, color: { argb: C.white }, name: 'Calibri' }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(1).height = 32

  // Fila 2 · Leyenda
  sheet.mergeCells(`A2:${lastCol}2`)
  const legend = sheet.getCell('A2')
  legend.value = `${weekLabel}  ·  Generado ${dayjs().format('DD/MM/YYYY HH:mm')}  ·  Verde: revisado esta semana  |  Naranja: último registro histórico  |  Rojo: sin ningún registro`
  legend.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subtitleFill } }
  legend.font = { size: 9, color: { argb: C.subtitle }, name: 'Calibri', italic: true }
  legend.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(2).height = 18

  // Fila 3 · Encabezados
  const headerRow = sheet.getRow(HEADER_ROW)
  headerRow.values = spec.columnas.map((col) => col.header)
  headerRow.height = 34
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spec.accent } }
    cell.font = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: C.white } },
      left: { style: 'thin', color: { argb: C.white } },
      bottom: { style: 'medium', color: { argb: 'FF404040' } },
      right: { style: 'thin', color: { argb: C.white } },
    }
  })

  return sheet
}

const cerrarHoja = (sheet: ExcelJS.Worksheet, columnCount: number) => {
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: Math.max(sheet.rowCount, HEADER_ROW), column: columnCount },
  }
}

const pintarFilaEstado = (row: ExcelJS.Row, estado: EstadoDato) => {
  const fill =
    estado === 'ACTUAL' ? C.greenFill : estado === 'HISTORICO' ? C.orangeFill : C.redFill
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.font = { size: 10, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
}

const pintarEstadoCell = (cell: ExcelJS.Cell, estado: EstadoDato) => {
  if (estado === 'ACTUAL') {
    cell.value = 'SEMANA ACTUAL'
    cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: C.greenDark } }
  } else if (estado === 'HISTORICO') {
    cell.value = 'HISTÓRICO'
    cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: C.orangeDark } }
  } else {
    cell.value = 'SIN REGISTRO'
    cell.font = { size: 9, name: 'Calibri', bold: true, color: { argb: C.redDark } }
  }
}

/** Marca una celda como problema (texto rojo en negrita) */
const marcarProblema = (cell: ExcelJS.Cell) => {
  cell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: C.redDark } }
}

const si = (value: boolean | null | undefined, positivo = 'SI', negativo = 'NO') => {
  if (value === null || value === undefined) return '-'
  return value ? positivo : negativo
}

const limpio = (value: string | null | undefined) => {
  const text = value?.toString().trim()
  return text ? text.replace(/_/g, ' ') : '-'
}

// ---------- Datos ----------

/** Última fila por bus de una tabla de módulo (histórico completo hasta endISO) */
const fetchUltimoPorBus = async <T extends { bus_ppu: string; created_at: string }>(
  table: 'tags' | 'camaras' | 'extintores' | 'mobileye' | 'odometro' | 'rack' | 'publicidad' | 'wifi',
  endISO: string
): Promise<Map<string, T>> => {
  const { data } = await supabase
    .from(table)
    .select('*')
    .lte('created_at', endISO)
    .order('created_at', { ascending: false })
    .limit(10000)
  const latest = new Map<string, T>()
  ;((data as T[]) ?? []).forEach((row) => {
    if (!latest.has(row.bus_ppu)) latest.set(row.bus_ppu, row)
  })
  return latest
}

const estadoDe = (createdAt: string | undefined, startISO: string): EstadoDato => {
  if (!createdAt) return 'NUNCA'
  return dayjs(createdAt).isBefore(dayjs(startISO)) ? 'HISTORICO' : 'ACTUAL'
}

// ============================================================
// EXPORTADOR PRINCIPAL
// ============================================================

export const exportAllModulesToXlsx = async (startDate?: string, endDate?: string) => {
  const start = startDate ?? dayjs().isoWeekday(1).startOf('day').toISOString()
  const end = endDate ?? dayjs().isoWeekday(1).add(6, 'day').endOf('day').toISOString()
  const weekLabel = `Semana del ${dayjs(start).format('DD/MM/YYYY')} al ${dayjs(end).format('DD/MM/YYYY')}`

  // 1) Flota completa ordenada por terminal y número interno
  const { data: flotaData } = await supabase
    .from('flota')
    .select('*')
    .limit(10000)
    .order('terminal', { ascending: true })
    .order('numero_interno', { ascending: true })
  const flota = (flotaData as FlotaRow[]) ?? []
  if (flota.length === 0) {
    console.error('No se pudo obtener la flota')
    return
  }

  // 2) Última revisión por bus (histórico completo) + revisiones de la semana
  const { data: revisionesData } = await supabase
    .from('revisiones')
    .select('*')
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .limit(10000)
  const revisiones = (revisionesData as RevisionRow[]) ?? []
  const ultimaRevision = new Map<string, RevisionRow>()
  revisiones.forEach((rev) => {
    if (!ultimaRevision.has(rev.bus_ppu)) ultimaRevision.set(rev.bus_ppu, rev)
  })
  const revisadosSemana = new Set(
    revisiones.filter((rev) => !dayjs(rev.created_at).isBefore(dayjs(start))).map((r) => r.bus_ppu)
  )

  // 3) Último registro por bus de cada módulo (independiente de la revisión:
  //    si el módulo se capturó en una revisión anterior, igual se rescata)
  const [tags, camaras, extintores, mobileyes, odometros, racks, publicidades, wifis] =
    await Promise.all([
      fetchUltimoPorBus<TagRow>('tags', end),
      fetchUltimoPorBus<CamarasRow>('camaras', end),
      fetchUltimoPorBus<ExtintoresRow>('extintores', end),
      fetchUltimoPorBus<MobileyeRow>('mobileye', end),
      fetchUltimoPorBus<OdometroRow>('odometro', end),
      fetchUltimoPorBus<RackRow>('rack', end),
      fetchUltimoPorBus<PublicidadRow>('publicidad', end),
      fetchUltimoPorBus<WifiRow>('wifi', end),
    ])

  // 4) Tickets pendientes de la semana (para el informe)
  const { data: ticketsData } = await supabase
    .from('tickets')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .neq('estado', 'RESUELTO')
    .limit(10000)
  const ticketsPendientes = ((ticketsData as TicketRow[]) ?? []).length

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Mini-Check'
  workbook.created = new Date()

  // ---------- Predicados de problema por módulo ----------
  const camaraDetalle = (detalle: CamarasRow['detalle'], keys: string[]): boolean | null => {
    if (!detalle || typeof detalle !== 'object') return null
    const record = detalle as Record<string, unknown>
    for (const key of keys) {
      if (key in record && typeof record[key] === 'boolean') return record[key] as boolean
    }
    return null
  }

  const problemaExtintor = (e: ExtintoresRow) =>
    !e.tiene ||
    e.certificacion === 'VENCIDA' ||
    (e.sonda !== null && e.sonda !== 'OK') ||
    (e.manometro !== null && e.manometro !== 'OK') ||
    (e.presion !== null && e.presion !== 'OPTIMO') ||
    (e.cilindro !== null && e.cilindro !== 'OK') ||
    (e.porta !== null && e.porta !== 'TIENE')

  const problemaCamara = (cam: CamarasRow) =>
    cam.monitor_estado !== 'FUNCIONA' ||
    ['camDelantera', 'camCabina', 'camInteriores', 'camTrasera'].some(
      (key) => camaraDetalle(cam.detalle, [key]) === false
    )

  const problemaMobileye = (m: MobileyeRow) =>
    m.alerta_izq === false ||
    m.alerta_der === false ||
    m.consola === false ||
    m.sensor_frontal === false ||
    m.sensor_izq === false ||
    m.sensor_der === false

  const problemaOdometro = (o: OdometroRow) => o.estado !== 'OK'
  const problemaTag = (t: TagRow) => !t.tiene
  const problemaRack = (r: RackRow) =>
    r.tiene_disco_duro === false || r.tiene_candado === false || r.cerraduras_buen_estado === false
  const problemaPublicidad = (p: PublicidadRow) => p.danio === true || p.residuos === true
  const problemaWifi = (w: WifiRow) =>
    w.tiene_internet === false || w.ppu_visible === false || w.bus_encendido === false

  // ==========================================================
  // HOJA 1 · INFORME (dashboard con KPIs y resúmenes)
  // ==========================================================
  const informe = workbook.addWorksheet('INFORME', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    properties: { tabColor: { argb: C.navy } },
  })
  for (let i = 1; i <= 10; i += 1) informe.getColumn(i).width = 15
  informe.getColumn(1).width = 26

  // Banner
  informe.mergeCells('A1:J1')
  const infTitle = informe.getCell('A1')
  infTitle.value = 'INFORME SEMANAL DE FLOTA · MINI-CHECK'
  infTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
  infTitle.font = { bold: true, size: 17, color: { argb: C.white }, name: 'Calibri' }
  infTitle.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  informe.getRow(1).height = 38

  informe.mergeCells('A2:J2')
  const infSub = informe.getCell('A2')
  infSub.value = `${weekLabel}  ·  Generado ${dayjs().format('DD/MM/YYYY HH:mm')}  ·  Cada hoja muestra el último registro disponible por bus`
  infSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subtitleFill } }
  infSub.font = { size: 10, color: { argb: C.subtitle }, italic: true, name: 'Calibri' }
  infSub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  informe.getRow(2).height = 20

  const seccion = (rowIdx: number, texto: string) => {
    informe.mergeCells(`A${rowIdx}:J${rowIdx}`)
    const cell = informe.getCell(`A${rowIdx}`)
    cell.value = texto
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navyLight } }
    cell.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    informe.getRow(rowIdx).height = 22
  }

  // KPIs
  const totalFlota = flota.length
  const totalRevisadosSemana = flota.filter((bus) => revisadosSemana.has(bus.ppu)).length
  const cumplimiento = totalFlota > 0 ? (totalRevisadosSemana / totalFlota) * 100 : 0
  const enPanne = flota.filter(
    (bus) => ultimaRevision.get(bus.ppu)?.estado_bus === 'EN_PANNE'
  ).length
  const operativos = flota.filter(
    (bus) => ultimaRevision.get(bus.ppu)?.estado_bus === 'OPERATIVO'
  ).length
  const nuncaRevisados = flota.filter((bus) => !ultimaRevision.has(bus.ppu)).length

  const tile = (
    rowLabel: number,
    colStart: number,
    label: string,
    value: number | string,
    accent: string,
    fill: string
  ) => {
    const c1 = colLetter(colStart)
    const c2 = colLetter(colStart + 1)
    informe.mergeCells(`${c1}${rowLabel}:${c2}${rowLabel}`)
    informe.mergeCells(`${c1}${rowLabel + 1}:${c2}${rowLabel + 1}`)
    const labelCell = informe.getCell(`${c1}${rowLabel}`)
    labelCell.value = label.toUpperCase()
    labelCell.font = { size: 8, bold: true, color: { argb: C.subtitle }, name: 'Calibri' }
    labelCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    const valueCell = informe.getCell(`${c1}${rowLabel + 1}`)
    valueCell.value = value
    valueCell.font = { size: 22, bold: true, color: { argb: accent }, name: 'Calibri' }
    valueCell.alignment = { vertical: 'middle', horizontal: 'center' }
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    for (const ref of [`${c1}${rowLabel}`, `${c1}${rowLabel + 1}`]) {
      informe.getCell(ref).border = thinBorder
    }
    informe.getRow(rowLabel).height = 20
    informe.getRow(rowLabel + 1).height = 34
  }

  seccion(4, 'INDICADORES CLAVE DE LA SEMANA')
  tile(5, 1, 'Total flota', totalFlota, C.navy, C.blueFill)
  tile(5, 3, 'Revisados esta semana', totalRevisadosSemana, C.blue, C.blueFill)
  tile(5, 5, '% cumplimiento', `${cumplimiento.toFixed(1)}%`, cumplimiento >= 90 ? C.greenDark : cumplimiento >= 70 ? C.amberDark : C.redDark, cumplimiento >= 90 ? C.greenFill : cumplimiento >= 70 ? C.amberFill : C.redFill)
  tile(5, 7, 'Operativos (último dato)', operativos, C.greenDark, C.greenFill)
  tile(5, 9, 'En panne (último dato)', enPanne, enPanne > 0 ? C.redDark : C.greenDark, enPanne > 0 ? C.redFill : C.greenFill)

  const sinTag = flota.filter((bus) => {
    const tag = tags.get(bus.ppu)
    return tag ? problemaTag(tag) : false
  }).length
  const mobileyeDanados = flota.filter((bus) => {
    const mob = mobileyes.get(bus.ppu)
    return mob ? problemaMobileye(mob) : false
  }).length

  tile(8, 1, 'Sin revisar esta semana', totalFlota - totalRevisadosSemana, C.amberDark, C.amberFill)
  tile(8, 3, 'Sin registro histórico', nuncaRevisados, nuncaRevisados > 0 ? C.redDark : C.greenDark, nuncaRevisados > 0 ? C.redFill : C.greenFill)
  tile(8, 5, 'Tickets pendientes', ticketsPendientes, ticketsPendientes > 0 ? C.redDark : C.greenDark, ticketsPendientes > 0 ? C.redFill : C.greenFill)
  tile(8, 7, 'Mobileye con daño', mobileyeDanados, mobileyeDanados > 0 ? C.redDark : C.greenDark, mobileyeDanados > 0 ? C.redFill : C.greenFill)
  tile(8, 9, 'Buses sin TAG', sinTag, sinTag > 0 ? C.redDark : C.greenDark, sinTag > 0 ? C.redFill : C.greenFill)

  // Resumen por terminal
  seccion(11, 'AVANCE POR TERMINAL')
  const terminalHeader = informe.getRow(12)
  terminalHeader.values = ['TERMINAL', 'FLOTA', 'REVISADOS', '% AVANCE', 'OPERATIVOS', 'EN PANNE', 'SIN REVISAR', 'AVANCE VISUAL']
  informe.mergeCells('H12:J12')
  terminalHeader.height = 22
  terminalHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate } }
    cell.font = { bold: true, size: 9, color: { argb: C.white }, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = thinBorder
  })

  const terminales = [...new Set(flota.map((bus) => bus.terminal))]
  let rowIdx = 13
  terminales.forEach((terminal) => {
    const busesTerminal = flota.filter((bus) => bus.terminal === terminal)
    const revisados = busesTerminal.filter((bus) => revisadosSemana.has(bus.ppu)).length
    const pct = busesTerminal.length > 0 ? (revisados / busesTerminal.length) * 100 : 0
    const panneT = busesTerminal.filter(
      (bus) => ultimaRevision.get(bus.ppu)?.estado_bus === 'EN_PANNE'
    ).length
    const operT = busesTerminal.filter(
      (bus) => ultimaRevision.get(bus.ppu)?.estado_bus === 'OPERATIVO'
    ).length

    const row = informe.getRow(rowIdx)
    row.values = [
      terminal,
      busesTerminal.length,
      revisados,
      Number(pct.toFixed(1)),
      operT,
      panneT,
      busesTerminal.length - revisados,
      '█'.repeat(Math.max(Math.round(pct / 5), pct > 0 ? 1 : 0)) || '·',
    ]
    informe.mergeCells(`H${rowIdx}:J${rowIdx}`)
    row.height = 20
    row.eachCell((cell, col) => {
      cell.border = thinBorder
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 8 ? 'left' : 'center', indent: col === 1 || col === 8 ? 1 : 0 }
    })
    row.getCell(1).font = { size: 10, name: 'Calibri', bold: true }
    const pctCell = row.getCell(4)
    pctCell.numFmt = '0.0"%"'
    pctCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: pct >= 90 ? C.greenFill : pct >= 70 ? C.amberFill : C.redFill },
    }
    pctCell.font = {
      size: 10,
      name: 'Calibri',
      bold: true,
      color: { argb: pct >= 90 ? C.greenDark : pct >= 70 ? C.amberDark : C.redDark },
    }
    const barCell = row.getCell(8)
    barCell.font = { size: 10, name: 'Calibri', color: { argb: C.blue } }
    if (panneT > 0) marcarProblema(row.getCell(6))
    rowIdx += 1
  })

  // Estado por módulo
  rowIdx += 1
  seccion(rowIdx, 'ESTADO POR MÓDULO (último registro de cada bus)')
  rowIdx += 1
  const moduloHeader = informe.getRow(rowIdx)
  moduloHeader.values = ['MÓDULO', 'CON REGISTRO', 'SIN REGISTRO', 'CON PROBLEMA', '% FLOTA CON DATO', '% SIN PROBLEMA']
  moduloHeader.height = 22
  moduloHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.slate } }
    cell.font = { bold: true, size: 9, color: { argb: C.white }, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder
  })
  rowIdx += 1

  const resumenModulo = <T,>(
    nombre: string,
    mapa: Map<string, T>,
    esProblema: (row: T) => boolean
  ) => {
    const conRegistro = flota.filter((bus) => mapa.has(bus.ppu)).length
    const conProblema = flota.filter((bus) => {
      const registro = mapa.get(bus.ppu)
      return registro ? esProblema(registro) : false
    }).length
    return { nombre, conRegistro, sinRegistro: totalFlota - conRegistro, conProblema }
  }

  const modulos = [
    resumenModulo('EXTINTORES', extintores, problemaExtintor),
    resumenModulo('TAGS', tags, problemaTag),
    resumenModulo('CÁMARAS', camaras, problemaCamara),
    resumenModulo('MOBILEYE', mobileyes, problemaMobileye),
    resumenModulo('ODÓMETRO', odometros, problemaOdometro),
    resumenModulo('RACK', racks, problemaRack),
    resumenModulo('WIFI', wifis, problemaWifi),
    resumenModulo('PUBLICIDAD', publicidades, problemaPublicidad),
  ]

  modulos.forEach((mod) => {
    const pctDato = totalFlota > 0 ? (mod.conRegistro / totalFlota) * 100 : 0
    const pctOk = mod.conRegistro > 0 ? ((mod.conRegistro - mod.conProblema) / mod.conRegistro) * 100 : 0
    const row = informe.getRow(rowIdx)
    row.values = [
      mod.nombre,
      mod.conRegistro,
      mod.sinRegistro,
      mod.conProblema,
      Number(pctDato.toFixed(1)),
      Number(pctOk.toFixed(1)),
    ]
    row.height = 20
    row.eachCell((cell, col) => {
      cell.border = thinBorder
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'left' : 'center', indent: col === 1 ? 1 : 0 }
    })
    row.getCell(1).font = { size: 10, name: 'Calibri', bold: true }
    if (mod.conProblema > 0) {
      marcarProblema(row.getCell(4))
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.redFill } }
    }
    for (const [col, pct] of [[5, pctDato], [6, pctOk]] as const) {
      const cell = row.getCell(col)
      cell.numFmt = '0.0"%"'
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: pct >= 90 ? C.greenFill : pct >= 70 ? C.amberFill : C.redFill },
      }
      cell.font = {
        size: 10,
        name: 'Calibri',
        bold: true,
        color: { argb: pct >= 90 ? C.greenDark : pct >= 70 ? C.amberDark : C.redDark },
      }
    }
    rowIdx += 1
  })

  // Hallazgos clave
  rowIdx += 1
  seccion(rowIdx, 'HALLAZGOS CLAVE')
  rowIdx += 1
  const contarProblema = <T,>(mapa: Map<string, T>, pred: (row: T) => boolean) =>
    [...mapa.values()].filter(pred).length

  const hallazgos: [string, number][] = [
    ['Extintores con certificación vencida', contarProblema(extintores, (e) => e.certificacion === 'VENCIDA')],
    ['Buses sin extintor', contarProblema(extintores, (e) => !e.tiene)],
    ['Buses sin TAG', sinTag],
    ['Monitores de cámara con falla', contarProblema(camaras, (cam) => cam.monitor_estado !== 'FUNCIONA')],
    ['Equipos Mobileye con algún daño', mobileyeDanados],
    ['Odómetros inconsistentes o sin funcionar', contarProblema(odometros, problemaOdometro)],
    ['Racks sin disco duro', contarProblema(racks, (r) => r.tiene_disco_duro === false)],
    ['Buses sin internet (WiFi)', contarProblema(wifis, (w) => w.tiene_internet === false)],
    ['Publicidad con daño o residuos', contarProblema(publicidades, problemaPublicidad)],
  ]

  hallazgos.forEach(([texto, cantidad]) => {
    const row = informe.getRow(rowIdx)
    informe.mergeCells(`A${rowIdx}:H${rowIdx}`)
    informe.mergeCells(`I${rowIdx}:J${rowIdx}`)
    row.getCell(1).value = texto
    row.getCell(9).value = cantidad
    row.height = 19
    const textCell = row.getCell(1)
    textCell.font = { size: 10, name: 'Calibri', color: { argb: C.slate } }
    textCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    textCell.border = thinBorder
    const countCell = row.getCell(9)
    countCell.alignment = { vertical: 'middle', horizontal: 'center' }
    countCell.border = thinBorder
    countCell.font = {
      size: 10,
      name: 'Calibri',
      bold: true,
      color: { argb: cantidad > 0 ? C.redDark : C.greenDark },
    }
    countCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: cantidad > 0 ? C.redFill : C.greenFill },
    }
    rowIdx += 1
  })

  // ==========================================================
  // HOJA 2 · RESUMEN GENERAL
  // ==========================================================
  const sheetResumen = crearHoja(
    workbook,
    {
      nombre: 'RESUMEN',
      titulo: 'RESUMEN GENERAL DE REVISIONES',
      accent: C.navyLight,
      columnas: [
        { header: 'PPU', key: 'ppu', width: 12 },
        { header: 'N° INTERNO', key: 'interno', width: 11 },
        { header: 'TERMINAL', key: 'terminal', width: 18 },
        { header: 'ESTADO DATO', key: 'estado_dato', width: 16 },
        { header: 'ESTADO BUS', key: 'estado_bus', width: 14 },
        { header: 'INSPECTOR', key: 'inspector', width: 24 },
        { header: 'FECHA ÚLTIMA REVISIÓN', key: 'fecha', width: 18 },
        { header: 'OBSERVACIONES GENERALES', key: 'observaciones', width: 46 },
      ],
    },
    weekLabel
  )

  flota.forEach((bus) => {
    const rev = ultimaRevision.get(bus.ppu)
    const estado = estadoDe(rev?.created_at, start)
    const row = sheetResumen.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      estado_dato: '',
      estado_bus: rev ? limpio(rev.estado_bus) : '-',
      inspector: rev?.inspector_nombre ?? '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY HH:mm') : '-',
      observaciones: rev?.observaciones ?? '-',
    })
    pintarFilaEstado(row, estado)
    pintarEstadoCell(row.getCell(4), estado)
    row.getCell(1).font = { size: 10, name: 'Calibri', bold: true }
    if (rev?.estado_bus === 'EN_PANNE') marcarProblema(row.getCell(5))
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  })
  cerrarHoja(sheetResumen, 8)

  // ---------- Helper para hojas de módulo ----------
  const hojaModulo = <T extends { created_at: string }>(
    spec: SheetSpec,
    mapa: Map<string, T>,
    construirFila: (bus: FlotaRow, registro: T | undefined) => Record<string, unknown>,
    resaltar?: (row: ExcelJS.Row, registro: T) => void
  ) => {
    const sheet = crearHoja(workbook, spec, weekLabel)
    flota.forEach((bus) => {
      const registro = mapa.get(bus.ppu)
      const estado = estadoDe(registro?.created_at, start)
      const row = sheet.addRow({
        ppu: bus.ppu,
        interno: bus.numero_interno,
        terminal: bus.terminal,
        ...construirFila(bus, registro),
        fecha_dato: registro ? dayjs(registro.created_at).format('DD/MM/YYYY') : '-',
        estado_dato: '',
      })
      pintarFilaEstado(row, estado)
      pintarEstadoCell(row.getCell(spec.columnas.length), estado)
      row.getCell(1).font = { size: 10, name: 'Calibri', bold: true }
      if (registro && resaltar) resaltar(row, registro)
    })
    cerrarHoja(sheet, spec.columnas.length)
    return sheet
  }

  const baseCols = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'N° INTERNO', key: 'interno', width: 11 },
    { header: 'TERMINAL', key: 'terminal', width: 18 },
  ]
  const colaCols = [
    { header: 'FECHA DATO', key: 'fecha_dato', width: 13 },
    { header: 'ESTADO DATO', key: 'estado_dato', width: 16 },
  ]

  // ==========================================================
  // HOJA 3 · EXTINTORES
  // ==========================================================
  hojaModulo<ExtintoresRow>(
    {
      nombre: 'EXTINTORES',
      titulo: 'EXTINTORES · ÚLTIMO REGISTRO POR BUS',
      accent: 'FFB91C1C',
      columnas: [
        ...baseCols,
        { header: 'TIENE', key: 'tiene', width: 9 },
        { header: 'VENCIMIENTO', key: 'vencimiento', width: 13 },
        { header: 'CERTIFICACIÓN', key: 'certificacion', width: 15 },
        { header: 'SONDA', key: 'sonda', width: 15 },
        { header: 'MANÓMETRO', key: 'manometro', width: 15 },
        { header: 'PRESIÓN', key: 'presion', width: 14 },
        { header: 'CILINDRO', key: 'cilindro', width: 12 },
        { header: 'PORTA EXTINTOR', key: 'porta', width: 15 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 32 },
        ...colaCols,
      ],
    },
    extintores,
    (_bus, ext) => ({
      tiene: ext ? si(ext.tiene) : '-',
      vencimiento:
        ext?.vencimiento_mes && ext?.vencimiento_anio
          ? `${String(ext.vencimiento_mes).padStart(2, '0')}/${ext.vencimiento_anio}`
          : '-',
      certificacion: limpio(ext?.certificacion),
      sonda: limpio(ext?.sonda),
      manometro: limpio(ext?.manometro),
      presion: limpio(ext?.presion),
      cilindro: limpio(ext?.cilindro),
      porta: limpio(ext?.porta),
      observacion: ext?.observacion ?? '-',
    }),
    (row, ext) => {
      if (!ext.tiene) marcarProblema(row.getCell(4))
      if (ext.certificacion === 'VENCIDA') marcarProblema(row.getCell(6))
      if (ext.sonda && ext.sonda !== 'OK') marcarProblema(row.getCell(7))
      if (ext.manometro && ext.manometro !== 'OK') marcarProblema(row.getCell(8))
      if (ext.presion && ext.presion !== 'OPTIMO') marcarProblema(row.getCell(9))
      if (ext.cilindro && ext.cilindro !== 'OK') marcarProblema(row.getCell(10))
      if (ext.porta && ext.porta !== 'TIENE') marcarProblema(row.getCell(11))
    }
  )

  // ==========================================================
  // HOJA 4 · TAGS
  // ==========================================================
  hojaModulo<TagRow>(
    {
      nombre: 'TAGS',
      titulo: 'TAGS · ÚLTIMO REGISTRO POR BUS',
      accent: 'FFCA8A04',
      columnas: [
        ...baseCols,
        { header: 'TIENE TAG', key: 'tiene', width: 11 },
        { header: 'N° SERIE', key: 'serie', width: 20 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 34 },
        ...colaCols,
      ],
    },
    tags,
    (_bus, tag) => ({
      tiene: tag ? si(tag.tiene, 'TIENE', 'NO TIENE') : '-',
      serie: tag?.tiene && tag.serie ? tag.serie : '-',
      observacion: tag?.observacion ?? '-',
    }),
    (row, tag) => {
      if (!tag.tiene) marcarProblema(row.getCell(4))
    }
  )

  // ==========================================================
  // HOJA 5 · CÁMARAS
  // ==========================================================
  const monitorLabel = (value: CamarasRow['monitor_estado'] | undefined) => {
    switch (value) {
      case 'FUNCIONA':
        return 'FUNCIONA'
      case 'APAGADO':
        return 'APAGADO / SIN ENERGIA'
      case 'CON_DAÑO':
        return 'CON DAÑO FISICO'
      case 'SIN_SENAL':
        return 'SIN SEÑAL'
      default:
        return '-'
    }
  }

  const camaraLabel = (detalle: CamarasRow['detalle'], keys: string[]) => {
    const value = camaraDetalle(detalle, keys)
    if (value === null) return '-'
    return value ? 'OK' : 'CON FALLA'
  }

  hojaModulo<CamarasRow>(
    {
      nombre: 'CAMARAS',
      titulo: 'CÁMARAS · ÚLTIMO REGISTRO POR BUS',
      accent: 'FF1D4ED8',
      columnas: [
        ...baseCols,
        { header: 'ESTADO MONITOR', key: 'estado', width: 20 },
        { header: 'DETALLE MONITOR', key: 'monitor_detalle', width: 30 },
        { header: 'CAM DELANTERA', key: 'cam_delantera', width: 13 },
        { header: 'CAM CABINA', key: 'cam_cabina', width: 12 },
        { header: 'CAM INTERIORES', key: 'cam_interiores', width: 13 },
        { header: 'CAM TRASERA', key: 'cam_trasera', width: 12 },
        { header: 'VISIBLE EN MONITOR', key: 'visibles_monitor', width: 14 },
        { header: 'ACTIVA REVERSA', key: 'activa_reversa', width: 13 },
        { header: 'ACTIVA PUERTAS', key: 'activa_puertas', width: 13 },
        { header: 'VISIBLE PUERTAS CERRADAS', key: 'visibles_puertas_cerradas', width: 15 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
        ...colaCols,
      ],
    },
    camaras,
    (_bus, cam) => {
      const detalle = cam?.detalle ?? null
      const monitorDetalle =
        detalle && typeof detalle === 'object'
          ? ((detalle as Record<string, unknown>).monitorDetalle ??
            (detalle as Record<string, unknown>).monitor_detalle)
          : null
      return {
        estado: monitorLabel(cam?.monitor_estado),
        monitor_detalle:
          typeof monitorDetalle === 'string' && monitorDetalle.trim() ? monitorDetalle : '-',
        cam_delantera: camaraLabel(detalle, ['camDelantera', 'cam_delantera']),
        cam_cabina: camaraLabel(detalle, ['camCabina', 'cam_cabina']),
        cam_interiores: camaraLabel(detalle, ['camInteriores', 'cam_interiores']),
        cam_trasera: camaraLabel(detalle, ['camTrasera', 'cam_trasera']),
        visibles_monitor: camaraLabel(detalle, ['visiblesMonitor', 'visibles_monitor']),
        activa_reversa: camaraLabel(detalle, ['activaReversa', 'activa_reversa']),
        activa_puertas: camaraLabel(detalle, ['activaPuertas', 'activa_puertas']),
        visibles_puertas_cerradas: camaraLabel(detalle, [
          'visiblesPuertasCerradas',
          'visibles_puertas_cerradas',
        ]),
        observacion: cam?.observacion ?? '-',
      }
    },
    (row, cam) => {
      if (cam.monitor_estado !== 'FUNCIONA') marcarProblema(row.getCell(4))
      for (let col = 6; col <= 13; col += 1) {
        if (row.getCell(col).value === 'CON FALLA') marcarProblema(row.getCell(col))
      }
    }
  )

  // ==========================================================
  // HOJA 6 · MOBILEYE
  // ==========================================================
  const mobLabel = (value: boolean | null | undefined, registro: boolean) => {
    if (value === true) return 'TIENE'
    if (value === false) return 'DAÑADO'
    return registro ? 'SIN DATO' : '-'
  }

  hojaModulo<MobileyeRow>(
    {
      nombre: 'MOBILEYE',
      titulo: 'MOBILEYE · ÚLTIMO REGISTRO POR BUS',
      accent: 'FF7C3AED',
      columnas: [
        ...baseCols,
        { header: 'MARCA BUS', key: 'marca', width: 12 },
        { header: 'ALERTA IZQ', key: 'alerta_izq', width: 12 },
        { header: 'ALERTA DER', key: 'alerta_der', width: 12 },
        { header: 'CONSOLA', key: 'consola', width: 12 },
        { header: 'SENSOR FRONTAL', key: 'sensor_frontal', width: 13 },
        { header: 'SENSOR IZQ', key: 'sensor_izq', width: 12 },
        { header: 'SENSOR DER', key: 'sensor_der', width: 12 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 34 },
        ...colaCols,
      ],
    },
    mobileyes,
    (bus, mob) => ({
      marca: mob?.bus_marca ?? bus.marca,
      alerta_izq: mobLabel(mob?.alerta_izq, Boolean(mob)),
      alerta_der: mobLabel(mob?.alerta_der, Boolean(mob)),
      consola: mobLabel(mob?.consola, Boolean(mob)),
      sensor_frontal: mobLabel(mob?.sensor_frontal, Boolean(mob)),
      sensor_izq: mobLabel(mob?.sensor_izq, Boolean(mob)),
      sensor_der: mobLabel(mob?.sensor_der, Boolean(mob)),
      observacion: mob?.observacion ?? '-',
    }),
    (row) => {
      for (let col = 5; col <= 10; col += 1) {
        if (row.getCell(col).value === 'DAÑADO') marcarProblema(row.getCell(col))
      }
    }
  )

  // ==========================================================
  // HOJA 7 · ODÓMETRO
  // ==========================================================
  hojaModulo<OdometroRow>(
    {
      nombre: 'ODOMETRO',
      titulo: 'ODÓMETRO · ÚLTIMO REGISTRO POR BUS',
      accent: 'FF0F766E',
      columnas: [
        ...baseCols,
        { header: 'LECTURA (KM)', key: 'lectura', width: 14 },
        { header: 'ESTADO', key: 'estado', width: 16 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 34 },
        ...colaCols,
      ],
    },
    odometros,
    (_bus, odo) => ({
      lectura: odo ? odo.lectura : '-',
      estado: limpio(odo?.estado),
      observacion: odo?.observacion ?? '-',
    }),
    (row, odo) => {
      if (odo.estado !== 'OK') marcarProblema(row.getCell(5))
      row.getCell(4).numFmt = '#,##0'
    }
  )

  // ==========================================================
  // HOJA 8 · RACK
  // ==========================================================
  hojaModulo<RackRow>(
    {
      nombre: 'RACK',
      titulo: 'RACK · ÚLTIMO REGISTRO POR BUS',
      accent: 'FF334155',
      columnas: [
        ...baseCols,
        { header: 'TIENE DISCO DURO', key: 'disco', width: 13 },
        { header: 'SEGURIDAD EXTRA', key: 'seguridad', width: 13 },
        { header: 'TIENE CANDADO', key: 'candado', width: 13 },
        { header: 'CERRADURAS OK', key: 'cerraduras', width: 13 },
        { header: 'CERRADURAS ESPERADAS', key: 'esperadas', width: 14 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 32 },
        ...colaCols,
      ],
    },
    racks,
    (_bus, rack) => ({
      disco: si(rack?.tiene_disco_duro),
      seguridad: si(rack?.tiene_seguridad_extra),
      candado: si(rack?.tiene_candado),
      cerraduras: si(rack?.cerraduras_buen_estado),
      esperadas: rack?.cantidad_cerraduras_esperada ?? '-',
      observacion: rack?.observacion ?? '-',
    }),
    (row, rack) => {
      if (rack.tiene_disco_duro === false) marcarProblema(row.getCell(4))
      if (rack.tiene_candado === false) marcarProblema(row.getCell(6))
      if (rack.cerraduras_buen_estado === false) marcarProblema(row.getCell(7))
    }
  )

  // ==========================================================
  // HOJA 9 · WIFI
  // ==========================================================
  hojaModulo<WifiRow>(
    {
      nombre: 'WIFI',
      titulo: 'WIFI · ÚLTIMO REGISTRO POR BUS',
      accent: 'FF0369A1',
      columnas: [
        ...baseCols,
        { header: 'PPU VISIBLE', key: 'ppu_visible', width: 12 },
        { header: 'BUS ENCENDIDO', key: 'encendido', width: 13 },
        { header: 'CON INTERNET', key: 'internet', width: 13 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 34 },
        ...colaCols,
      ],
    },
    wifis,
    (_bus, wifi) => ({
      ppu_visible: si(wifi?.ppu_visible),
      encendido: si(wifi?.bus_encendido),
      internet: si(wifi?.tiene_internet),
      observacion: wifi?.observacion ?? '-',
    }),
    (row, wifi) => {
      if (wifi.ppu_visible === false) marcarProblema(row.getCell(4))
      if (wifi.bus_encendido === false) marcarProblema(row.getCell(5))
      if (wifi.tiene_internet === false) marcarProblema(row.getCell(6))
    }
  )

  // ==========================================================
  // HOJA 10 · PUBLICIDAD (incluye nombre de publicidad y lados)
  // ==========================================================
  const ladoLabel = (
    lados: PublicidadRow['detalle_lados'],
    key: 'izquierda' | 'derecha' | 'luneta'
  ) => {
    const lado = lados?.[key]
    if (!lado) return '-'
    if (!lado.tiene) return 'NO TIENE'
    const extras = [lado.danio ? 'DAÑO' : null, lado.residuos ? 'RESIDUOS' : null].filter(Boolean)
    return extras.length > 0 ? `SI · ${extras.join(' · ')}` : 'SI'
  }

  hojaModulo<PublicidadRow>(
    {
      nombre: 'PUBLICIDAD',
      titulo: 'PUBLICIDAD · ÚLTIMO REGISTRO POR BUS',
      accent: 'FFBE185D',
      columnas: [
        ...baseCols,
        { header: 'TIENE', key: 'tiene', width: 9 },
        { header: 'NOMBRE PUBLICIDAD', key: 'nombre', width: 28 },
        { header: 'CON DAÑO', key: 'danio', width: 10 },
        { header: 'RESIDUOS', key: 'residuos', width: 10 },
        { header: 'LADO IZQUIERDO', key: 'lado_izq', width: 16 },
        { header: 'LADO DERECHO', key: 'lado_der', width: 16 },
        { header: 'LUNETA', key: 'luneta', width: 16 },
        { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
        ...colaCols,
      ],
    },
    publicidades,
    (_bus, pub) => ({
      tiene: pub ? si(pub.tiene) : '-',
      // Se rescata SIEMPRE el nombre registrado, tenga o no publicidad vigente
      nombre: pub?.nombre_publicidad?.trim() ? pub.nombre_publicidad : '-',
      danio: si(pub?.danio),
      residuos: si(pub?.residuos),
      lado_izq: ladoLabel(pub?.detalle_lados ?? null, 'izquierda'),
      lado_der: ladoLabel(pub?.detalle_lados ?? null, 'derecha'),
      luneta: ladoLabel(pub?.detalle_lados ?? null, 'luneta'),
      observacion: pub?.observacion ?? '-',
    }),
    (row, pub) => {
      row.getCell(5).font = { size: 10, name: 'Calibri', bold: true }
      if (pub.danio) marcarProblema(row.getCell(6))
      if (pub.residuos) marcarProblema(row.getCell(7))
      for (let col = 8; col <= 10; col += 1) {
        const value = String(row.getCell(col).value ?? '')
        if (value.includes('DAÑO') || value.includes('RESIDUOS')) marcarProblema(row.getCell(col))
      }
    }
  )

  // Generar archivo
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Reporte_Flota_Detallado_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
  link.click()
  window.URL.revokeObjectURL(url)
}

// ============================================
// PDF EJECUTIVO CON GRÁFICOS E INFORMACIÓN ÚTIL
// ============================================

export const exportExecutivePdf = async (startDate?: string, endDate?: string) => {
  const doc = new jsPDF()

  // Calcular rango de fechas (actual o especificado)
  const start = startDate ?? dayjs().isoWeekday(1).startOf('day').toISOString()
  const end = endDate ?? dayjs().isoWeekday(1).add(6, 'day').endOf('day').toISOString()

  // Obtener datos estadísticos
  const { data: flota } = await supabase.from('flota').select('*')
  const { data: revisiones } = await supabase
    .from('revisiones')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .eq('estado', 'PENDIENTE')

  const totalFlota = flota?.length || 0
  const totalRevisados = revisiones?.length || 0
  const porcentajeRevisado = totalFlota > 0 ? ((totalRevisados / totalFlota) * 100).toFixed(1) : '0'
  const operativos =
    (revisiones as RevisionRow[])?.filter((r) => r.estado_bus === 'OPERATIVO').length || 0
  const enPanne =
    (revisiones as RevisionRow[])?.filter((r) => r.estado_bus === 'EN_PANNE').length || 0
  const porcentajeOperativo =
    totalRevisados > 0 ? ((operativos / totalRevisados) * 100).toFixed(1) : '0'
  const ticketsPendientes = (tickets as TicketRow[])?.length || 0

  // ===== ENCABEZADO =====
  doc.setFillColor(59, 91, 255)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('INFORME EJECUTIVO', 105, 20, { align: 'center' })
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`Semana ${dayjs().format('[ISO] YYYY-[W]WW')}`, 105, 30, { align: 'center' })
  doc.text(`Generado: ${dayjs().format('DD/MM/YYYY HH:mm')}`, 105, 36, { align: 'center' })

  // ===== INDICADORES CLAVE =====
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('📊 INDICADORES CLAVE', 14, 55)

  // Boxes de métricas
  const metrics = [
    { label: 'Total Flota', value: totalFlota, x: 14, color: [59, 91, 255] },
    { label: 'Revisados', value: totalRevisados, x: 60, color: [16, 185, 129] },
    { label: '% Cumplimiento', value: `${porcentajeRevisado}%`, x: 106, color: [251, 146, 60] },
    { label: 'Operativos', value: operativos, x: 152, color: [34, 197, 94] },
  ]

  metrics.forEach((metric) => {
    doc.setFillColor(metric.color[0], metric.color[1], metric.color[2])
    doc.roundedRect(metric.x, 62, 40, 22, 3, 3, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(String(metric.value), metric.x + 20, 74, { align: 'center' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(metric.label, metric.x + 20, 80, { align: 'center' })
  })

  // ===== GRÁFICO DE BARRAS: ESTADO OPERATIVO =====
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('🚌 ESTADO OPERATIVO DE LA FLOTA', 14, 100)

  const chartX = 14
  const chartY = 108
  const chartWidth = 180
  const maxValue = Math.max(operativos, enPanne, 1)

  // Barra de Operativos
  const operativosWidth = (operativos / maxValue) * chartWidth
  doc.setFillColor(34, 197, 94)
  doc.rect(chartX, chartY, operativosWidth, 15, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`✅ OPERATIVOS: ${operativos} (${porcentajeOperativo}%)`, chartX + 5, chartY + 10)

  // Barra de En Panne
  const panneWidth = (enPanne / maxValue) * chartWidth
  doc.setFillColor(239, 68, 68)
  doc.rect(chartX, chartY + 20, panneWidth, 15, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(`⚠️ EN PANNE: ${enPanne}`, chartX + 5, chartY + 30)

  // ===== TICKETS PENDIENTES =====
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('🎫 TICKETS PENDIENTES', 14, 162)

  if (ticketsPendientes === 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(34, 197, 94)
    doc.text('✅ No hay tickets pendientes. ¡Excelente trabajo!', 14, 172)
  } else {
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(14, 168, 180, 12, 2, 2, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(217, 119, 6)
    doc.text(`⚠️ ${ticketsPendientes} tickets requieren atención`, 18, 176)
  }

  // ===== RESUMEN DE INSPECCIONES RECIENTES =====
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('📋 ÚLTIMAS INSPECCIONES', 14, 195)

  const ultimasRevisiones = (revisiones as RevisionRow[])
    ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  let yPos = 204

  ultimasRevisiones?.forEach((rev) => {
    const estado = rev.estado_bus === 'OPERATIVO' ? '✅' : '⚠️'
    const fecha = dayjs(rev.created_at).format('DD/MM HH:mm')
    doc.setTextColor(0, 0, 0)
    doc.text(
      `${estado} ${rev.bus_ppu} (${rev.bus_interno}) - ${rev.inspector_nombre} - ${fecha}`,
      18,
      yPos
    )
    yPos += 6
  })

  // ===== PIE DE PÁGINA =====
  doc.setFillColor(241, 245, 249)
  doc.rect(0, 270, 210, 27, 'F')
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text(
    'Este informe fue generado automáticamente por Mini-Check',
    105,
    280,
    { align: 'center' }
  )
  doc.text(
    `Flota total: ${totalFlota} buses | Semana: ${dayjs().format('[ISO] YYYY-[W]WW')}`,
    105,
    286,
    { align: 'center' }
  )

  // Guardar
  doc.save(`Informe_Ejecutivo_${dayjs().format('YYYYMMDD_HHmm')}.pdf`)
}
