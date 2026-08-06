import { jsPDF } from 'jspdf'
import dayjs from '@/lib/dayjs'

export interface BusPendiente {
  ppu: string
  interno: string
  terminal: string
}

export interface DatosHojaPendientes {
  buses: BusPendiente[]
  semana: number
  rangoSemana: string
  terminal: string
  totalFlota: number
  revisados: number
  /**
   * Módulos vigentes sobre los que se calculó el pendiente.
   *
   * La hoja se imprime y se lleva a terreno; sin decir qué se estaba pidiendo
   * esa semana, dentro de tres meses nadie sabe si "180 pendientes" era el
   * check completo o sólo la prueba de +15.
   */
  alcance?: string[]
}

/* Paleta del documento, alineada con la marca de la app */
const TINTA = { r: 15, g: 23, b: 42 }
const MARCA = { r: 79, g: 70, b: 229 }
const SUAVE = { r: 100, g: 116, b: 139 }
const LINEA = { r: 203, g: 213, b: 225 }
const FONDO_ALT = { r: 245, g: 247, b: 251 }

/**
 * Hoja de ruta de buses pendientes: una sola página, siempre.
 *
 * El listado se reparte en columnas y el tamaño de fila se calcula a partir
 * del espacio disponible, de modo que 12 o 120 buses caben igual sin generar
 * una segunda página. Es una hoja para llevar en la mano por el terminal, no
 * un informe para archivar: por eso cada bus lleva su casilla para marcar.
 */
export const generarHojaPendientes = ({
  buses,
  semana,
  rangoSemana,
  terminal,
  totalFlota,
  revisados,
  alcance = [],
}: DatosHojaPendientes) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 11

  const ordenados = [...buses].sort((a, b) =>
    a.ppu.localeCompare(b.ppu, 'es', { numeric: true, sensitivity: 'base' })
  )

  /* ------------------------------------------------------------- Cabecera */
  const altoCabecera = 27

  doc.setFillColor(TINTA.r, TINTA.g, TINTA.b)
  doc.rect(0, 0, ancho, altoCabecera, 'F')
  doc.setFillColor(MARCA.r, MARCA.g, MARCA.b)
  doc.rect(0, 0, ancho, 2.6, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text('BUSES PENDIENTES', margen, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(180, 190, 210)
  doc.text(
    `Semana ${semana} · ${rangoSemana}   |   ${terminal}`,
    margen,
    19.5
  )

  if (alcance.length > 0) {
    doc.setFontSize(7.4)
    doc.setTextColor(150, 165, 190)
    doc.text(`Se revisa: ${alcance.join(' · ')}`, margen, 24)
  }

  // Contador grande a la derecha: el dato que se busca de un vistazo
  const contador = String(ordenados.length)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(255, 255, 255)
  const anchoContador = doc.getTextWidth(contador)
  doc.text(contador, ancho - margen - anchoContador, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 190, 210)
  const etiqueta = 'PENDIENTES'
  doc.text(etiqueta, ancho - margen - doc.getTextWidth(etiqueta), 20)

  /* --------------------------------------------------- Franja de progreso */
  const yProgreso = altoCabecera + 6
  const avance = totalFlota > 0 ? revisados / totalFlota : 0
  const anchoBarra = ancho - margen * 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(SUAVE.r, SUAVE.g, SUAVE.b)
  doc.text(
    `AVANCE SEMANAL · ${revisados} de ${totalFlota} buses revisados`,
    margen,
    yProgreso - 1.6
  )
  const porcentaje = `${Math.round(avance * 100)}%`
  doc.setTextColor(MARCA.r, MARCA.g, MARCA.b)
  doc.text(porcentaje, ancho - margen - doc.getTextWidth(porcentaje), yProgreso - 1.6)

  doc.setFillColor(226, 232, 240)
  doc.roundedRect(margen, yProgreso, anchoBarra, 2.4, 1.2, 1.2, 'F')
  if (avance > 0) {
    doc.setFillColor(MARCA.r, MARCA.g, MARCA.b)
    doc.roundedRect(margen, yProgreso, Math.max(2.4, anchoBarra * avance), 2.4, 1.2, 1.2, 'F')
  }

  // Reparto por terminal: le dice al supervisor dónde está el trabajo
  const porTerminal = new Map<string, number>()
  ordenados.forEach((bus) => {
    porTerminal.set(bus.terminal, (porTerminal.get(bus.terminal) ?? 0) + 1)
  })
  const resumenTerminales = [...porTerminal.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, cantidad]) => `${nombre}: ${cantidad}`)
    .join('   ·   ')

  if (resumenTerminales) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(SUAVE.r, SUAVE.g, SUAVE.b)
    doc.text(resumenTerminales, margen, yProgreso + 6)
  }

  /* ------------------------------------------------- Rejilla de pendientes */
  const yInicio = yProgreso + (resumenTerminales ? 11 : 8)
  const altoPie = 11
  const altoDisponible = alto - yInicio - altoPie - 3

  // Ajuste a una sola página: se prueba el menor número de columnas que deja
  // filas cómodas y, si la flota pendiente es enorme, se sigue comprimiendo.
  // La altura de fila NUNCA supera el espacio disponible dividido entre las
  // filas, así que el listado no puede desbordar el pie de página.
  const ALTO_FILA_IDEAL = 10.5
  const ALTO_FILA_COMODA = 5.4
  const MAX_COLUMNAS = 6

  // Se empieza por dos columnas: con pocas pendientes la hoja se llena a lo
  // alto en vez de dejar media página en blanco, y cada celda es más ancha.
  let columnas = 2
  let filas = Math.max(1, Math.ceil(ordenados.length / columnas))

  while (
    columnas < MAX_COLUMNAS &&
    altoDisponible / filas < ALTO_FILA_COMODA
  ) {
    columnas += 1
    filas = Math.max(1, Math.ceil(ordenados.length / columnas))
  }

  const altoFila = Math.min(ALTO_FILA_IDEAL, altoDisponible / filas)
  const anchoColumna = (ancho - margen * 2) / columnas
  const escala = Math.min(1, altoFila / ALTO_FILA_IDEAL)

  // Por debajo de cierta altura la casilla y el número interno dejan de
  // aportar y sólo ensucian: en ese caso la hoja se queda con la PPU.
  const mostrarCasilla = altoFila >= 4.6
  const mostrarInterno = altoFila >= 4.2

  if (ordenados.length === 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(22, 163, 74)
    doc.text('Sin buses pendientes: la semana está al día.', margen, yInicio + 10)
  }

  ordenados.forEach((bus, indice) => {
    // Relleno por columnas: se lee de arriba abajo, como una lista de papel
    const columna = Math.floor(indice / filas)
    const fila = indice % filas
    const x = margen + columna * anchoColumna
    const y = yInicio + fila * altoFila

    if (fila % 2 === 0) {
      doc.setFillColor(FONDO_ALT.r, FONDO_ALT.g, FONDO_ALT.b)
      doc.rect(x, y, anchoColumna - 1.2, altoFila, 'F')
    }

    let xTexto = x + 2
    const yTexto = y + altoFila / 2 + 1 * escala

    if (mostrarCasilla) {
      // Casilla para ir marcando en terreno
      const ladoCasilla = Math.min(3.2, altoFila - 1.8)
      doc.setDrawColor(LINEA.r, LINEA.g, LINEA.b)
      doc.setLineWidth(0.25)
      doc.roundedRect(
        x + 1.6,
        y + (altoFila - ladoCasilla) / 2,
        ladoCasilla,
        ladoCasilla,
        0.6,
        0.6
      )
      xTexto = x + ladoCasilla + 3.4
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(Math.max(6, 9 * escala + 0.6))
    doc.setTextColor(TINTA.r, TINTA.g, TINTA.b)
    doc.text(bus.ppu, xTexto, yTexto)

    if (mostrarInterno) {
      // Alineado al borde derecho de la celda: así nunca invade la columna
      // siguiente, sea cual sea el largo de la PPU o del número interno.
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(Math.max(5, 6.8 * escala + 0.4))
      doc.setTextColor(SUAVE.r, SUAVE.g, SUAVE.b)
      const interno = `#${bus.interno}`
      const anchoInterno = doc.getTextWidth(interno)
      const xInterno = x + anchoColumna - 2.6 - anchoInterno
      // Sólo si queda hueco real tras la PPU
      if (xInterno > xTexto + doc.getTextWidth(bus.ppu) + 1.5) {
        doc.text(interno, xInterno, yTexto)
      }
    }
  })

  /* ------------------------------------------------------------------ Pie */
  const yPie = alto - altoPie

  doc.setDrawColor(LINEA.r, LINEA.g, LINEA.b)
  doc.setLineWidth(0.3)
  doc.line(margen, yPie, ancho - margen, yPie)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(TINTA.r, TINTA.g, TINTA.b)
  doc.text('Mini-Check · Control Operacional de Flota', margen, yPie + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(SUAVE.r, SUAVE.g, SUAVE.b)
  doc.text('Ordenado por PPU · marca cada bus al revisarlo', margen, yPie + 8)

  const generado = `Generado ${dayjs().format('DD/MM/YYYY HH:mm')} hrs`
  doc.text(generado, ancho - margen - doc.getTextWidth(generado), yPie + 4.5)

  const hoja = 'Hoja única'
  doc.text(hoja, ancho - margen - doc.getTextWidth(hoja), yPie + 8)

  doc.save(`Pendientes_S${semana}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`)

  // Devolver el documento permite comprobar en pruebas que sigue siendo
  // de una sola página con cualquier tamaño de flota.
  return doc
}
