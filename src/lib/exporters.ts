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

  // 1. Obtener TODA la flota
  const { data: flotaData } = await supabase
    .from('flota')
    .select('*')
    .order('numero_interno')

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

  // 5. Obtener datos complementarios para TODAS las revisiones relevantes (semana + históricas)
  // Usamos 'in' con los IDs recolectados

  // Función helper para fetch seguro por chunks si son muchos IDs (opcional, aquí simple)
  // Para mini check asumimos que cabe en una query

  let tags: TagRow[] = []
  let camaras: CamarasRow[] = []
  let extintores: ExtintoresRow[] = []
  let odometros: OdometroRow[] = []
  let publicidades: PublicidadRow[] = []

  if (revisionIds.length > 0) {
    const pTags = supabase.from('tags').select('*').in('revision_id', revisionIds)
    const pCamaras = supabase.from('camaras').select('*').in('revision_id', revisionIds)
    const pExtintores = supabase.from('extintores').select('*').in('revision_id', revisionIds)
    const pOdometros = supabase.from('odometro').select('*').in('revision_id', revisionIds)
    const pPublicidades = supabase.from('publicidad').select('*').in('revision_id', revisionIds)

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

  // 6. Agrupar flota por TERMINAL
  const flotaPorTerminal = flota.reduce((acc: Record<string, FlotaRow[]>, bus: FlotaRow) => {
    const term = bus.terminal || 'Sin Terminal'
    if (!acc[term]) acc[term] = []
    acc[term].push(bus)
    return acc
  }, {} as Record<string, FlotaRow[]>)

  // 7. Crear hojas por Terminal
  Object.entries(flotaPorTerminal).forEach(([nombreTerminal, busesDelTerminal]) => {
    // Normalizar nombre de hoja (max 31 chars, sin caracteres especiales prohibidos excel)
    const sheetName = nombreTerminal.replace(/[*?:/\[\]\\]/g, '').substring(0, 31)
    const sheet = workbook.addWorksheet(sheetName.toUpperCase())

    // Configurar columnas
    sheet.columns = [
      { header: 'PPU', key: 'ppu', width: 12 },
      { header: 'Nº INTERNO', key: 'interno', width: 12 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 20 },
      { header: 'AÑO', key: 'anio', width: 8 },
      // { header: 'TERMINAL', key: 'terminal', width: 20 }, // Ya está en la hoja
      { header: 'ESTADO REVISIÓN SEMANAL', key: 'estado_revision', width: 30 },
      { header: 'ESTADO BUS (En Revisión)', key: 'estado_bus', width: 25 },
      { header: 'INSPECTOR', key: 'inspector', width: 25 },
      { header: 'FECHA INSPECCIÓN', key: 'fecha', width: 18 },
      { header: 'TAG', key: 'tag', width: 15 },
      { header: 'CÁMARAS', key: 'camaras', width: 15 },
      { header: 'EXTINTOR', key: 'extintor', width: 15 },
      { header: 'ODÓMETRO', key: 'odometro', width: 15 },
      { header: 'PUBLICIDAD', key: 'publicidad', width: 15 },
      { header: 'OBSERVACIONES', key: 'observaciones', width: 40 },
    ]

    // Estilo encabezado
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      // Color diferente por terminal si se desea, o standard corporativo
      fgColor: { argb: 'FF1E40AF' }, // Azul oscuro corporativo
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 30

    // Poblar datos
    busesDelTerminal.forEach((bus: FlotaRow) => {
      // Buscar revisión de ESTA semana
      const revisionSemana = revisionesSemana?.find((r) => r.bus_ppu === bus.ppu)

      let revisionData: RevisionRow | undefined = revisionSemana
      let esHistorica = false

      // Si no hay de esta semana, buscar la histórica
      if (!revisionSemana) {
        revisionData = revisionesHistoricas.find((r) => r.bus_ppu === bus.ppu)
        if (revisionData) esHistorica = true
      }

      const rowValues: any = {
        ppu: bus.ppu,
        interno: bus.numero_interno,
        marca: bus.marca,
        modelo: bus.modelo,
        anio: bus.anio,
      }

      if (revisionData) {
        // Datos asociados a la revisión encontrada (sea actual o histórica)
        const tag = tags.find((t) => t.revision_id === revisionData?.id)
        const camara = camaras.find((c) => c.revision_id === revisionData?.id)
        const extintor = extintores.find((e) => e.revision_id === revisionData?.id)
        const odometro = odometros.find((o) => o.revision_id === revisionData?.id)
        const publicidad = publicidades.find((p) => p.revision_id === revisionData?.id)

        // Lógica de estado
        if (esHistorica) {
          rowValues.estado_revision = `⚠️ NO REVISADO (Última: ${dayjs(revisionData.created_at).format('DD/MM/YYYY')})`
        } else {
          rowValues.estado_revision = '✅ REVISADO SEMANA ACTUAL'
        }

        rowValues.estado_bus =
          revisionData.estado_bus === 'OPERATIVO' ? '✅ OPERATIVO' : '⚠️ EN PANNE'
        rowValues.inspector = revisionData.inspector_nombre
        rowValues.fecha = dayjs(revisionData.created_at).format('DD/MM/YYYY HH:mm')

        // Lógica detallada (copiada del original y mejorada)
        rowValues.tag = tag?.tiene ? '✅ Tiene' : '❌ No tiene'
        rowValues.camaras = camara
          ? camara.monitor_estado === 'FUNCIONA'
            ? '✅ Funciona'
            : `⚠️ ${camara.monitor_estado.replace(/_/g, ' ')}`
          : 'N/A'
        rowValues.extintor = extintor
          ? extintor.tiene
            ? extintor.certificacion === 'BUENA' // Nota: Ajustar si el campo en DB es distinto, sigo lógica original
              ? '✅ OK'
              : '⚠️ Dañada/Vencida'
            : '❌ No tiene'
          : 'N/A'
        rowValues.odometro = odometro
          ? odometro.estado === 'OK'
            ? `✅ ${odometro.lectura} km`
            : `⚠️ ${odometro.estado}`
          : 'N/A'
        rowValues.publicidad = publicidad
          ? publicidad.tiene
            ? publicidad.danio
              ? '⚠️ Con daño'
              : '✅ OK'
            : 'Sin publicidad'
          : 'N/A'
        rowValues.observaciones = revisionData.observaciones || ''
      } else {
        // NUNCA REVISADO
        rowValues.estado_revision = '❌ NUNCA REVISADO'
        rowValues.estado_bus = '-'
        rowValues.inspector = '-'
        rowValues.fecha = '-'
        rowValues.tag = '-'
        rowValues.camaras = '-'
        rowValues.extintor = '-'
        rowValues.odometro = '-'
        rowValues.publicidad = '-'
        rowValues.observaciones = 'Sin historial en sistema'
      }

      const row = sheet.addRow(rowValues)

      // Estilos Condicionales
      if (!revisionData) {
        // Nunca revisado: Rojo claro
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' },
        }
      } else if (esHistorica) {
        // Revisión antigua: Amarillo claro / Naranja suave
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEDD5' },
        }
      } else {
        // Revisado esta semana
        if (revisionData.estado_bus === 'EN_PANNE') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3CD' }, // Amarillo alerta
          }
        } else {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDCFCE7' }, // Verde éxito
          }
        }
      }

      // Bordes
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        }
      })
    }) // Fin busesDelTerminal loop

    // Resumen al final de la hoja del terminal
    sheet.addRow([])
    const total = busesDelTerminal.length
    const revisados = busesDelTerminal.filter((b: FlotaRow) =>
      revisionesSemana?.find((r) => r.bus_ppu === b.ppu)
    ).length
    const faltantes = total - revisados

    // De los revisados (esta semana), cuántos operativos
    const operativosSemana = busesDelTerminal.filter((b: FlotaRow) => {
      const r = revisionesSemana?.find((r) => r.bus_ppu === b.ppu)
      return r && r.estado_bus === 'OPERATIVO'
    }).length

    // De los revisados (esta semana), cuántos panne
    const panneSemana = busesDelTerminal.filter((b: FlotaRow) => {
      const r = revisionesSemana?.find((r) => r.bus_ppu === b.ppu)
      return r && r.estado_bus === 'EN_PANNE'
    }).length

    const resumenRow = sheet.addRow([
      'RESUMEN TERMINAL:',
      `Total Flota: ${total}`,
      `Revisados Semana: ${revisados}`,
      `Faltantes: ${faltantes}`,
      `Operativos (Semana): ${operativosSemana}`,
      `En Panne (Semana): ${panneSemana}`,
    ])
    resumenRow.font = { bold: true }
    resumenRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    }
  }) // Fin terminal loop

  // Generar archivo
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Reporte_Flota_Completo_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
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
