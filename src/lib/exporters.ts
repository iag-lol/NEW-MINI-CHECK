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

export const exportAllModulesToXlsx = async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('INSPECCIONES SEMANALES')

  // Obtener TODA la flota
  const { data: flota } = await supabase
    .from('flota')
    .select('*')
    .order('numero_interno')

  // Obtener todas las revisiones de la semana actual
  const { data: revisiones } = await supabase
    .from('revisiones')
    .select('*')
    .gte('created_at', dayjs().startOf('week').toISOString())

  // Obtener datos complementarios de módulos
  const { data: tags } = await supabase.from('tags').select('*')
  const { data: camaras } = await supabase.from('camaras').select('*')
  const { data: extintores } = await supabase.from('extintores').select('*')
  const { data: odometros } = await supabase.from('odometro').select('*')
  const { data: publicidades } = await supabase.from('publicidad').select('*')

  // Configurar columnas con diseño profesional
  sheet.columns = [
    { header: 'PPU', key: 'ppu', width: 12 },
    { header: 'Nº INTERNO', key: 'interno', width: 12 },
    { header: 'MARCA', key: 'marca', width: 15 },
    { header: 'MODELO', key: 'modelo', width: 20 },
    { header: 'AÑO', key: 'anio', width: 8 },
    { header: 'TERMINAL', key: 'terminal', width: 20 },
    { header: 'ESTADO REVISIÓN', key: 'estado_revision', width: 18 },
    { header: 'ESTADO BUS', key: 'estado_bus', width: 15 },
    { header: 'INSPECTOR', key: 'inspector', width: 25 },
    { header: 'FECHA INSPECCIÓN', key: 'fecha', width: 18 },
    { header: 'TAG', key: 'tag', width: 15 },
    { header: 'CÁMARAS', key: 'camaras', width: 15 },
    { header: 'EXTINTOR', key: 'extintor', width: 15 },
    { header: 'ODÓMETRO', key: 'odometro', width: 15 },
    { header: 'PUBLICIDAD', key: 'publicidad', width: 15 },
    { header: 'OBSERVACIONES', key: 'observaciones', width: 40 },
  ]

  // Estilo de encabezados
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B5BFF' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 25

  // Procesar cada bus de la flota
  ;(flota as FlotaRow[])?.forEach((bus: FlotaRow) => {
    // Buscar revisión de esta semana para este bus
    const revision = (revisiones as RevisionRow[])?.find((r) => r.bus_ppu === bus.ppu)

    if (revision) {
      // Bus revisado - mostrar datos reales
      const tag = (tags as TagRow[])?.find((t) => t.revision_id === revision.id)
      const camara = (camaras as CamarasRow[])?.find((c) => c.revision_id === revision.id)
      const extintor = (extintores as ExtintoresRow[])?.find((e) => e.revision_id === revision.id)
      const odometro = (odometros as OdometroRow[])?.find((o) => o.revision_id === revision.id)
      const publicidad = (publicidades as PublicidadRow[])?.find(
        (p) => p.revision_id === revision.id
      )

      const row = sheet.addRow({
        ppu: bus.ppu,
        interno: bus.numero_interno,
        marca: bus.marca,
        modelo: bus.modelo,
        anio: bus.anio,
        terminal: bus.terminal,
        estado_revision: '✅ REVISADO',
        estado_bus: revision.estado_bus === 'OPERATIVO' ? '✅ OPERATIVO' : '⚠️ EN PANNE',
        inspector: revision.inspector_nombre,
        fecha: dayjs(revision.created_at).format('DD/MM/YYYY HH:mm'),
        tag: tag?.tiene ? '✅ Tiene' : '❌ No tiene',
        camaras: camara
          ? camara.monitor_estado === 'FUNCIONA'
            ? '✅ Funciona'
            : `⚠️ ${camara.monitor_estado.replace(/_/g, ' ')}`
          : 'N/A',
        extintor: extintor
          ? extintor.tiene
            ? extintor.certificacion === 'BUENA'
              ? '✅ OK - Buena'
              : '⚠️ Dañada'
            : '❌ No tiene'
          : 'N/A',
        odometro: odometro
          ? odometro.estado === 'OK'
            ? `✅ ${odometro.lectura} km`
            : `⚠️ ${odometro.estado.replace(/_/g, ' ')}`
          : 'N/A',
        publicidad: publicidad
          ? publicidad.tiene
            ? publicidad.danio
              ? '⚠️ Con daño'
              : '✅ OK'
            : 'Sin publicidad'
          : 'N/A',
        observaciones: revision.observaciones || 'Sin observaciones',
      })

      // Color según estado
      if (revision.estado_bus === 'EN_PANNE') {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF3CD' }, // Amarillo claro
        }
      } else {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD4EDDA' }, // Verde claro
        }
      }
    } else {
      // Bus NO revisado - marcar como PENDIENTE
      const row = sheet.addRow({
        ppu: bus.ppu,
        interno: bus.numero_interno,
        marca: bus.marca,
        modelo: bus.modelo,
        anio: bus.anio,
        terminal: bus.terminal,
        estado_revision: '⏳ PENDIENTE',
        estado_bus: 'Sin revisar',
        inspector: '-',
        fecha: '-',
        tag: 'Pendiente',
        camaras: 'Pendiente',
        extintor: 'Pendiente',
        odometro: 'Pendiente',
        publicidad: 'Pendiente',
        observaciones: 'Bus no inspeccionado esta semana',
      })

      // Color gris para pendientes
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F9FA' }, // Gris muy claro
      }
    }
  })

  // Aplicar bordes a todas las celdas
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      }
      if (rowNumber > 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      }
    })
  })

  // Agregar resumen al final
  const totalRows = flota?.length || 0
  const revisadosCount = revisiones?.length || 0
  const pendientesCount = totalRows - revisadosCount
  const operativosCount =
    (revisiones as RevisionRow[])?.filter((r) => r.estado_bus === 'OPERATIVO').length || 0
  const panneCount =
    (revisiones as RevisionRow[])?.filter((r) => r.estado_bus === 'EN_PANNE').length || 0

  sheet.addRow([])
  const resumenRow = sheet.addRow([
    'RESUMEN:',
    `Total: ${totalRows}`,
    `Revisados: ${revisadosCount}`,
    `Pendientes: ${pendientesCount}`,
    `Operativos: ${operativosCount}`,
    `En Panne: ${panneCount}`,
  ])
  resumenRow.font = { bold: true, size: 11 }
  resumenRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  }

  // Generar archivo
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Inspecciones_Semanales_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
  link.click()
  window.URL.revokeObjectURL(url)
}

// ============================================
// PDF EJECUTIVO CON GRÁFICOS E INFORMACIÓN ÚTIL
// ============================================

export const exportExecutivePdf = async () => {
  const doc = new jsPDF()

  // Obtener datos estadísticos
  const { data: flota } = await supabase.from('flota').select('*')
  const { data: revisiones } = await supabase
    .from('revisiones')
    .select('*')
    .gte('created_at', dayjs().startOf('week').toISOString())
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
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
