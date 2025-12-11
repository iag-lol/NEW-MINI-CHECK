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
type OdometroRow = Tables<'odometro'>
type PublicidadRow = Tables<'publicidad'>
type TicketRow = Tables<'tickets'>

// ============================================
// XLSX MEJORADO CON DATOS REALES Y TODA LA FLOTA
// ============================================

export const exportAllModulesToXlsx = async (startDate?: string, endDate?: string) => {
  const workbook = new ExcelJS.Workbook()

  // 1. Obtener TODA la flota y ordenar por Terminal y luego por Número Interno
  const { data: flotaData } = await supabase
    .from('flota')
    .select('*')
    .limit(10000)
    .order('terminal', { ascending: true })
    .order('numero_interno', { ascending: true })

  const flota = flotaData as FlotaRow[] | null

  if (!flota) {
    console.error('No se pudo obtener la flota')
    return
  }

  // 2. Obtener todas las revisiones de la semana (actual o especificada)
  const start = startDate ?? dayjs().isoWeekday(1).startOf('day').toISOString()
  const end = endDate ?? dayjs().isoWeekday(1).add(6, 'day').endOf('day').toISOString()

  const { data: revisionesData } = await supabase
    .from('revisiones')
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .limit(10000)

  const revisionesSemana = revisionesData as RevisionRow[] | null

  // 3. Identificar buses sin revisión esta semana
  const busesRevisadosIds = new Set(revisionesSemana?.map((r) => r.bus_ppu))
  const busesSinRevision = flota.filter((bus) => !busesRevisadosIds.has(bus.ppu))
  const ppusSinRevision = busesSinRevision.map((b) => b.ppu)

  // 4. Obtener última revisión histórica para buses NO revisados esta semana
  let revisionesHistoricas: RevisionRow[] = []
  if (ppusSinRevision.length > 0) {
    // Nota: Supabase no tiene una forma nativa simple de "latest per group" en una sola query
    // Optimización: Traemos las revisiones más recientes de esos buses (limitado a últimas 3 meses o similar si fuera necesario, 
    // pero para MVP traemos todo ordenado y filtramos en JS)

    // Para no saturar, podemos hacer batching si son muchos, o query específica.
    // Usaremos una query simple filtrando por PPU.

    const { data: historialData } = await supabase
      .from('revisiones')
      .select('*')
      .in('bus_ppu', ppusSinRevision)
      .order('created_at', { ascending: false })
      .limit(10000)

    const historial = historialData as RevisionRow[] | null

    // Filtrar para dejar solo la más reciente por PPU
    if (historial) {
      const latestMap = new Map<string, RevisionRow>()
      historial.forEach((rev) => {
        if (!latestMap.has(rev.bus_ppu)) {
          latestMap.set(rev.bus_ppu, rev)
        }
      })
      revisionesHistoricas = Array.from(latestMap.values())
    }
  }

  // Combinar set de revisiones a consultar detalles
  const todasRevisiones = [...(revisionesSemana || []), ...revisionesHistoricas]
  const revisionIds = todasRevisiones.map((r) => r.id)

  // 5. Obtener datos complementarios para TODAS las revisiones relevantes
  // Usamos 'in' con los IDs recolectados

  // Función helper para fetch seguro por chunks si son muchos IDs (opcional, aquí simple)
  // Para mini check asumimos que cabe en una query

  let tags: TagRow[] = []
  let camaras: CamarasRow[] = []
  let extintores: ExtintoresRow[] = []
  let odometros: OdometroRow[] = []
  let publicidades: PublicidadRow[] = []

  if (revisionIds.length > 0) {
    const pTags = supabase.from('tags').select('*').in('revision_id', revisionIds).limit(10000)
    const pCamaras = supabase.from('camaras').select('*').in('revision_id', revisionIds).limit(10000)
    const pExtintores = supabase.from('extintores').select('*').in('revision_id', revisionIds).limit(10000)
    const pOdometros = supabase.from('odometro').select('*').in('revision_id', revisionIds).limit(10000)
    const pPublicidades = supabase.from('publicidad').select('*').in('revision_id', revisionIds).limit(10000)

    const [resTags, resCamaras, resExtintores, resOdometros, resPublicidades] = await Promise.all([
      pTags,
      pCamaras,
      pExtintores,
      pOdometros,
      pPublicidades,
    ])

    tags = (resTags.data as TagRow[]) || []
    camaras = (resCamaras.data as CamarasRow[]) || []
    extintores = (resExtintores.data as ExtintoresRow[]) || []
    odometros = (resOdometros.data as OdometroRow[]) || []
    publicidades = (resPublicidades.data as PublicidadRow[]) || []
  }

  // Helper para buscar datos de una revisión
  const getRevisionData = (ppu: string) => {
    // 1. Buscar en semana actual
    let rev = revisionesSemana?.find(r => r.bus_ppu === ppu)
    let isHistorical = false

    // 2. Si no, buscar histórico
    if (!rev) {
      rev = revisionesHistoricas.find(r => r.bus_ppu === ppu)
      if (rev) isHistorical = true
    }

    return { rev, isHistorical }
  }

  const applyCommonRowStyles = (row: ExcelJS.Row, rev?: RevisionRow, isHistorical?: boolean) => {
    // Bordes
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      }
    })

    // Colores de fondo
    if (!rev) {
      // Nunca revisado
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } } // Rojo
    } else if (isHistorical) {
      // Histórico
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } } // Naranja
    } else {
      // Actual
      if (rev.estado_bus === 'EN_PANNE') {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } } // Amarillo
      } else {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } } // Verde
      }
    }
  }

  const setupHeader = (sheet: ExcelJS.Worksheet) => {
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 30
  }

  // ==========================================
  // HOJA 1: RESUMEN GENERAL
  // ==========================================
  const sheetResumen = workbook.addWorksheet('RESUMEN')
  sheetResumen.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'ESTADO REVISIÓN', key: 'estado_revision', width: 30 },
    { header: 'ESTADO BUS', key: 'estado_bus', width: 20 },
    { header: 'INSPECTOR', key: 'inspector', width: 25 },
    { header: 'FECHA INSPECCIÓN', key: 'fecha', width: 20 },
    { header: 'OBSERVACIONES GENERALES', key: 'observaciones', width: 50 },
  ]
  setupHeader(sheetResumen)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)

    const row = sheetResumen.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      estado_revision: rev ? (isHistorical ? `⚠️ HISTÓRICO (${dayjs(rev.created_at).format('DD/MM/YYYY')})` : '✅ ACTUAL') : '❌ SIN INFO',
      estado_bus: rev ? rev.estado_bus : '-',
      inspector: rev ? rev.inspector_nombre : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY HH:mm') : '-',
      observaciones: rev ? rev.observaciones : '-'
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })

  // ==========================================
  // HOJA 2: EXTINTORES
  // ==========================================
  const sheetExtintores = workbook.addWorksheet('EXTINTORES')
  sheetExtintores.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'TIENE', key: 'tiene', width: 10 },
    { header: 'VENCIMIENTO', key: 'vencimiento', width: 15 },
    { header: 'CERTIFICACIÓN', key: 'certificacion', width: 20 },
    { header: 'MANÓMETRO', key: 'manometro', width: 15 },
    { header: 'PRESIÓN', key: 'presion', width: 15 },
    { header: 'CILINDRO', key: 'cilindro', width: 15 },
    { header: 'PORTA EXTINTOR', key: 'porta', width: 20 },
    { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
    { header: 'FECHA REV.', key: 'fecha', width: 15 },
  ]
  setupHeader(sheetExtintores)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)
    const ext = rev ? extintores.find(e => e.revision_id === rev.id) : null

    const row = sheetExtintores.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      tiene: ext ? (ext.tiene ? 'SI' : 'NO') : '-',
      vencimiento: ext && ext.tiene ? `${ext.vencimiento_mes}/${ext.vencimiento_anio}` : '-',
      // CORRECCIÓN ORTOGRÁFICA: Comparar con 'VIGENTE' (según schema)
      certificacion: ext && ext.tiene ? ext.certificacion : '-',
      manometro: ext && ext.tiene ? ext.manometro : '-',
      presion: ext && ext.tiene ? ext.presion : '-',
      cilindro: ext && ext.tiene ? ext.cilindro : '-',
      porta: ext && ext.tiene ? ext.porta : '-',
      observacion: ext ? ext.observacion : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY') : '-',
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })

  // ==========================================
  // HOJA 3: TAGS
  // ==========================================
  const sheetTags = workbook.addWorksheet('TAGS')
  sheetTags.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'TIENE TAG', key: 'tiene', width: 12 },
    { header: 'Nº SERIE', key: 'serie', width: 20 },
    { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
    { header: 'FECHA REV.', key: 'fecha', width: 15 },
  ]
  setupHeader(sheetTags)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)
    const tag = rev ? tags.find(t => t.revision_id === rev.id) : null

    const row = sheetTags.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      tiene: tag ? (tag.tiene ? 'SI' : 'NO') : '-',
      serie: tag && tag.tiene ? tag.serie : '-',
      observacion: tag ? tag.observacion : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY') : '-',
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })

  // ==========================================
  // HOJA 4: CÁMARAS
  // ==========================================
  const sheetCamaras = workbook.addWorksheet('CAMARAS')
  sheetCamaras.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'ESTADO MONITOR', key: 'estado', width: 20 },
    { header: 'DETALLE CÁMARAS', key: 'detalle', width: 50 },
    { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
    { header: 'FECHA REV.', key: 'fecha', width: 15 },
  ]
  setupHeader(sheetCamaras)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)
    const cam = rev ? camaras.find(c => c.revision_id === rev.id) : null

    const row = sheetCamaras.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      estado: cam ? cam.monitor_estado : '-',
      detalle: cam && cam.detalle ? JSON.stringify(cam.detalle) : '-',
      observacion: cam ? cam.observacion : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY') : '-',
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })


  // ==========================================
  // HOJA 5: ODÓMETRO
  // ==========================================
  const sheetOdometro = workbook.addWorksheet('ODOMETRO')
  sheetOdometro.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'LECTURA (KM)', key: 'lectura', width: 15 },
    { header: 'ESTADO', key: 'estado', width: 20 },
    { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
    { header: 'FECHA REV.', key: 'fecha', width: 15 },
  ]
  setupHeader(sheetOdometro)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)
    const odo = rev ? odometros.find(o => o.revision_id === rev.id) : null

    const row = sheetOdometro.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      lectura: odo ? odo.lectura : '-',
      estado: odo ? odo.estado : '-',
      observacion: odo ? odo.observacion : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY') : '-',
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })

  // ==========================================
  // HOJA 6: PUBLICIDAD
  // ==========================================
  const sheetPublicidad = workbook.addWorksheet('PUBLICIDAD')
  sheetPublicidad.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'TIENE', key: 'tiene', width: 10 },
    { header: 'CON DAÑO', key: 'danio', width: 10 },
    { header: 'NOMBRE PUBLICIDAD', key: 'nombre', width: 30 },
    { header: 'OBSERVACIONES', key: 'observacion', width: 30 },
    { header: 'FECHA REV.', key: 'fecha', width: 15 },
  ]
  setupHeader(sheetPublicidad)

  flota.forEach((bus) => {
    const { rev, isHistorical } = getRevisionData(bus.ppu)
    const pub = rev ? publicidades.find(p => p.revision_id === rev.id) : null

    const row = sheetPublicidad.addRow({
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      tiene: pub ? (pub.tiene ? 'SI' : 'NO') : '-',
      danio: pub && pub.tiene ? (pub.danio ? 'SI' : 'NO') : '-',
      nombre: pub && pub.tiene ? pub.nombre_publicidad : '-',
      observacion: pub ? pub.observacion : '-',
      fecha: rev ? dayjs(rev.created_at).format('DD/MM/YYYY') : '-',
    })
    applyCommonRowStyles(row, rev, isHistorical)
  })


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
