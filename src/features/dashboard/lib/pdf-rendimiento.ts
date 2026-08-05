import { jsPDF } from 'jspdf'
import dayjs from '@/lib/dayjs'
import {
  formatearMinutos,
  type AnalisisRendimiento,
  type Severidad,
} from '@/features/dashboard/lib/analisis-rendimiento'

/* Paleta del informe */
const TINTA = [15, 23, 42] as const
const MARCA = [79, 70, 229] as const
const SUAVE = [100, 116, 139] as const
const LINEA = [214, 222, 234] as const
const FONDO = [246, 248, 252] as const

const SEVERIDAD_COLOR: Record<Severidad, readonly [number, number, number]> = {
  critica: [220, 38, 38],
  alta: [234, 88, 12],
  media: [202, 138, 4],
  info: [37, 99, 235],
}

const SEVERIDAD_ETIQUETA: Record<Severidad, string> = {
  critica: 'CRÍTICA',
  alta: 'ALTA',
  media: 'MEDIA',
  info: 'INFO',
}

/**
 * Informe de rendimiento de un colaborador.
 *
 * Es un documento de varias páginas a propósito: a diferencia de la hoja de
 * pendientes —que se lleva en la mano por el terminal— este se lee sentado y
 * se archiva, así que prima el detalle sobre la brevedad. La paginación se
 * gestiona con un cursor vertical que reserva sitio antes de dibujar cada
 * bloque, de modo que ninguna sección queda partida por la mitad.
 */
export const generarInformeRendimiento = (analisis: AnalisisRendimiento) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 14
  const util = ancho - margen * 2

  let y = 0
  let pagina = 0

  /* ------------------------------------------------------------- Andamiaje */

  const pie = () => {
    const yPie = alto - 10
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.3)
    doc.line(margen, yPie, ancho - margen, yPie)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...SUAVE)
    doc.text('Mini-Check · Chequeo de rendimiento', margen, yPie + 4)
    const derecha = `${analisis.nombre} · página ${pagina}`
    doc.text(derecha, ancho - margen - doc.getTextWidth(derecha), yPie + 4)
  }

  const nuevaPagina = () => {
    // jsPDF ya abre el documento con una página: en la primera llamada sólo
    // hay que tomar posesión de ella, no añadir otra.
    if (pagina > 0) {
      pie()
      doc.addPage()
    }
    pagina += 1
    y = margen + 4
  }

  /** Reserva `necesario` mm; si no caben, salta de página. */
  const reservar = (necesario: number) => {
    if (y + necesario > alto - 16) nuevaPagina()
  }

  const titulo = (texto: string) => {
    // Aire por encima: sin él el título se pega al bloque anterior y las
    // secciones se leen como un único muro de datos.
    if (pagina > 0 && y > margen + 6) y += 4
    reservar(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...TINTA)
    doc.text(texto.toLocaleUpperCase('es'), margen, y)
    doc.setDrawColor(...MARCA)
    doc.setLineWidth(0.8)
    doc.line(margen, y + 1.6, margen + doc.getTextWidth(texto.toLocaleUpperCase('es')), y + 1.6)
    y += 7
  }

  const parrafo = (texto: string, tamano = 8.5) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tamano)
    doc.setTextColor(...SUAVE)
    const lineas = doc.splitTextToSize(texto, util) as string[]
    reservar(lineas.length * (tamano * 0.42) + 2)
    doc.text(lineas, margen, y)
    y += lineas.length * (tamano * 0.42) + 2.5
  }

  /** Rejilla de cifras destacadas. */
  const tarjetas = (
    datos: Array<{ etiqueta: string; valor: string; nota?: string }>,
    columnas = 4
  ) => {
    const filas = Math.ceil(datos.length / columnas)
    const anchoCelda = util / columnas
    const altoCelda = 17
    reservar(filas * altoCelda + 2)

    datos.forEach((dato, indice) => {
      const columna = indice % columnas
      const fila = Math.floor(indice / columnas)
      const x = margen + columna * anchoCelda
      const yCelda = y + fila * altoCelda

      doc.setFillColor(...FONDO)
      doc.roundedRect(x, yCelda, anchoCelda - 2, altoCelda - 2.5, 1.6, 1.6, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.4)
      doc.setTextColor(...SUAVE)
      doc.text(dato.etiqueta.toLocaleUpperCase('es'), x + 3, yCelda + 4.6)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...TINTA)
      doc.text(dato.valor, x + 3, yCelda + 11)

      if (dato.nota) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(...SUAVE)
        doc.text(dato.nota, x + 3, yCelda + 14.2)
      }
    })

    y += filas * altoCelda + 2
  }

  /** Barras horizontales con etiqueta y valor. */
  const barras = (
    datos: Array<{ etiqueta: string; valor: number; resaltado?: boolean }>,
    sufijo = ''
  ) => {
    const maximo = Math.max(1, ...datos.map((dato) => dato.valor))
    const anchoEtiqueta = 34
    const anchoValor = 14
    const anchoBarra = util - anchoEtiqueta - anchoValor
    const altoFila = 6

    reservar(datos.length * altoFila + 2)

    datos.forEach((dato, indice) => {
      const yFila = y + indice * altoFila

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.2)
      doc.setTextColor(...SUAVE)
      doc.text(dato.etiqueta, margen, yFila + 3.4)

      doc.setFillColor(232, 236, 244)
      doc.roundedRect(margen + anchoEtiqueta, yFila + 0.8, anchoBarra, 3.2, 1.6, 1.6, 'F')

      const largo = (dato.valor / maximo) * anchoBarra
      if (largo > 0) {
        if (dato.resaltado) doc.setFillColor(...MARCA)
        else doc.setFillColor(148, 163, 184)
        doc.roundedRect(
          margen + anchoEtiqueta,
          yFila + 0.8,
          Math.max(1.8, largo),
          3.2,
          1.6,
          1.6,
          'F'
        )
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.2)
      doc.setTextColor(...TINTA)
      const texto = `${dato.valor}${sufijo}`
      doc.text(texto, ancho - margen - doc.getTextWidth(texto), yFila + 3.4)
    })

    y += datos.length * altoFila + 3
  }

  /** Tabla genérica con cabecera y filas alternas. */
  const tabla = (
    cabeceras: string[],
    filas: string[][],
    anchos: number[],
    alineacionDerecha: number[] = []
  ) => {
    const altoFila = 5.6

    const dibujarCabecera = () => {
      reservar(altoFila * 2)
      doc.setFillColor(...TINTA)
      doc.rect(margen, y, util, altoFila, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.6)
      doc.setTextColor(255, 255, 255)
      let x = margen
      cabeceras.forEach((cabecera, indice) => {
        const texto = cabecera.toLocaleUpperCase('es')
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.8)
        } else {
          doc.text(texto, x + 2, y + 3.8)
        }
        x += anchos[indice]
      })
      y += altoFila
    }

    dibujarCabecera()

    filas.forEach((fila, indiceFila) => {
      if (y + altoFila > alto - 16) {
        nuevaPagina()
        dibujarCabecera()
      }

      if (indiceFila % 2 === 0) {
        doc.setFillColor(...FONDO)
        doc.rect(margen, y, util, altoFila, 'F')
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...TINTA)
      let x = margen
      fila.forEach((celda, indice) => {
        const disponible = anchos[indice] - 4
        let texto = celda
        // Recorte con puntos suspensivos: mejor que invadir la columna vecina
        while (doc.getTextWidth(texto) > disponible && texto.length > 1) {
          texto = `${texto.slice(0, -2)}…`
        }
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.8)
        } else {
          doc.text(texto, x + 2, y + 3.8)
        }
        x += anchos[indice]
      })
      y += altoFila
    })

    y += 3
  }

  /* --------------------------------------------------------------- Portada */

  nuevaPagina()

  const altoCabecera = 34
  doc.setFillColor(...TINTA)
  doc.rect(0, 0, ancho, altoCabecera, 'F')
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ancho, 2.6, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(170, 182, 205)
  doc.text('CHEQUEO DE RENDIMIENTO', margen, 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text(analisis.nombre, margen, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(170, 182, 205)
  doc.text(`RUT ${analisis.rut}   |   ${analisis.periodoEtiqueta}`, margen, 26.5)
  doc.text(
    `${dayjs(analisis.desde).format('DD/MM/YYYY')} – ${dayjs(analisis.hasta).format('DD/MM/YYYY')}`,
    margen,
    31
  )

  // Puntuación global, alineada a la derecha
  const nota = String(analisis.puntuacion)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.setTextColor(255, 255, 255)
  const anchoNota = doc.getTextWidth(nota)
  doc.text(nota, ancho - margen - anchoNota - 8, 22)

  doc.setFontSize(10)
  doc.text('/100', ancho - margen - 7.5, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(170, 182, 205)
  const etiquetaNota = analisis.notaGlobal.toLocaleUpperCase('es')
  doc.text(etiquetaNota, ancho - margen - doc.getTextWidth(etiquetaNota), 28)

  y = altoCabecera + 9

  /* ------------------------------------------------------------- Resumen */

  titulo('Resumen del período')
  tarjetas([
    {
      etiqueta: 'Revisiones',
      valor: String(analisis.total),
      nota: `${analisis.busesDistintos} buses distintos`,
    },
    {
      etiqueta: 'Días activos',
      valor: `${analisis.diasActivos}/${analisis.diasLaborables}`,
      nota: `${analisis.cobertura.toFixed(0)} % de cobertura`,
    },
    {
      etiqueta: 'Promedio diario',
      valor: String(analisis.promedioPorDiaActivo),
      nota: `mediana ${analisis.medianaPorDiaActivo}`,
    },
    {
      etiqueta: 'Racha máxima',
      valor: `${analisis.rachaMaxima} d`,
      nota: 'días laborables seguidos',
    },
    {
      etiqueta: 'Entre revisiones',
      valor: formatearMinutos(analisis.cadenciaMedianaMin),
      nota: `media ${formatearMinutos(analisis.cadenciaMediaMin)}`,
    },
    {
      etiqueta: 'Jornada media',
      valor: formatearMinutos(analisis.jornadaMediaMin),
      nota:
        analisis.revisionesPorHora !== null
          ? `${analisis.revisionesPorHora} rev/hora`
          : 'sin datos',
    },
    {
      etiqueta: 'Ubicación válida',
      valor:
        analisis.precisionGps !== null ? `${analisis.precisionGps.toFixed(0)} %` : '—',
      nota:
        analisis.distanciaMediaM !== null
          ? `a ${analisis.distanciaMediaM} m del terminal`
          : 'sin GPS',
    },
    {
      etiqueta: 'Estado de flota',
      valor:
        analisis.tasaOperativa !== null ? `${analisis.tasaOperativa.toFixed(0)} %` : '—',
      nota: `${analisis.enPanne} en panne`,
    },
  ])

  /* -------------------------------------------------- Cómo se calcula la nota */

  titulo('Cómo se compone la puntuación')
  parrafo(
    'Cada componente se mide sobre el propio historial del colaborador, no contra una cifra fija: un inspector de terminal grande y otro de terminal pequeño no comparten ritmo, así que "revisó poco" sólo tiene sentido comparado con lo que esa persona hace habitualmente.'
  )
  barras(
    analisis.componentes.map((componente) => ({
      etiqueta: `${componente.etiqueta} (${Math.round(componente.peso * 100)} %)`,
      valor: componente.valor,
      resaltado: componente.valor >= 80,
    })),
    ' pts'
  )

  /* ------------------------------------------------------- Evolución semanal */

  titulo('Evolución semanal')
  if (analisis.porSemana.length === 0) {
    parrafo('No hay semanas dentro del período analizado.')
  } else {
    const lineas: string[] = []
    if (analisis.mejorSemana) {
      lineas.push(
        `Su mejor semana fue la ${analisis.mejorSemana.numero} (${dayjs(
          analisis.mejorSemana.inicio
        ).format('DD MMM')}) con ${analisis.mejorSemana.revisiones} revisiones en ${
          analisis.mejorSemana.diasActivos
        } días.`
      )
    }
    if (analisis.peorSemanaActiva && analisis.peorSemanaActiva.clave !== analisis.mejorSemana?.clave) {
      lineas.push(
        `La más floja con actividad fue la ${analisis.peorSemanaActiva.numero} con ${analisis.peorSemanaActiva.revisiones}.`
      )
    }
    if (analisis.semanasAusentes.length > 0) {
      lineas.push(
        `Sin ninguna revisión: ${analisis.semanasAusentes
          .map((semana) => `semana ${semana.numero}`)
          .join(', ')}.`
      )
    }
    parrafo(lineas.join(' '))

    barras(
      analisis.porSemana.map((semana) => ({
        etiqueta: semana.etiqueta,
        valor: semana.revisiones,
        resaltado: semana.clave === analisis.mejorSemana?.clave,
      }))
    )
  }

  /* ------------------------------------------------------ Reparto del trabajo */

  titulo('Reparto del trabajo')
  barras(
    analisis.porDiaSemana.map((dia) => ({
      etiqueta: dia.etiqueta,
      valor: dia.revisiones,
    }))
  )
  barras(
    analisis.porFranja.map((franja) => ({
      etiqueta: franja.etiqueta,
      valor: franja.revisiones,
    }))
  )

  /* ---------------------------------------------------------------- Alertas */

  titulo(`Alertas del período (${analisis.alertas.length})`)
  analisis.alertas.forEach((alerta) => {
    const lineasDetalle = doc.splitTextToSize(alerta.detalle, util - 22) as string[]
    const altoBloque = Math.max(9, lineasDetalle.length * 3.4 + 6)
    reservar(altoBloque + 2)

    doc.setFillColor(...FONDO)
    doc.roundedRect(margen, y, util, altoBloque, 1.6, 1.6, 'F')

    const color = SEVERIDAD_COLOR[alerta.severidad]
    doc.setFillColor(color[0], color[1], color[2])
    doc.roundedRect(margen, y, 1.6, altoBloque, 0.8, 0.8, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.8)
    doc.setTextColor(color[0], color[1], color[2])
    doc.text(SEVERIDAD_ETIQUETA[alerta.severidad], margen + 4, y + 4.2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...TINTA)
    doc.text(alerta.titulo, margen + 20, y + 4.4)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...SUAVE)
    doc.text(lineasDetalle, margen + 4, y + 8.4)

    y += altoBloque + 2
  })

  y += 2

  /* ------------------------------------------------------- Detalle por día */

  titulo('Detalle por jornada')
  if (analisis.porDia.length === 0) {
    parrafo('Sin jornadas con actividad en el período.')
  } else {
    parrafo(
      '"Entre rev." es el tiempo medio transcurrido entre dos revisiones consecutivas de esa misma jornada; "hueco" es la pausa más larga del día.'
    )
    tabla(
      ['Día', 'Rev.', 'Buses', 'Inicio', 'Fin', 'Jornada', 'Entre rev.', 'Hueco'],
      [...analisis.porDia]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map((dia) => [
          dia.etiqueta,
          String(dia.revisiones),
          String(dia.busesDistintos),
          dia.primera,
          dia.ultima,
          formatearMinutos(dia.jornadaMin),
          formatearMinutos(dia.cadenciaMediaMin),
          formatearMinutos(dia.huecoMaxMin),
        ]),
      // Los anchos suman el ancho útil de la página (188 mm)
      [38, 13, 15, 16, 16, 28, 32, 30],
      [1, 2]
    )
  }

  /* ------------------------------------------------------- Días sin registro */

  if (analisis.diasAusentes.length > 0) {
    titulo(`Días laborables sin registro (${analisis.diasAusentes.length})`)
    parrafo(
      'Días entre semana comprendidos en el período en los que no se registró ninguna revisión. El domingo no se considera laborable.'
    )
    const columnas = 6
    const anchoCelda = util / columnas
    const filas = Math.ceil(analisis.diasAusentes.length / columnas)
    reservar(filas * 6 + 2)
    analisis.diasAusentes.forEach((dia, indice) => {
      const x = margen + (indice % columnas) * anchoCelda
      const yFila = y + Math.floor(indice / columnas) * 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.2)
      doc.setTextColor(...TINTA)
      doc.text(dayjs(dia).format('ddd DD MMM'), x + 1, yFila + 3.8)
    })
    y += filas * 6 + 3
  }

  /* ------------------------------------------------------------------ Cierre */

  reservar(16)
  doc.setFillColor(...FONDO)
  doc.roundedRect(margen, y, util, 13, 1.6, 1.6, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(...SUAVE)
  doc.text(
    `Informe generado el ${dayjs().format('DD/MM/YYYY [a las] HH:mm')} hrs sobre ${
      analisis.total
    } revisiones registradas. Terminales: ${
      analisis.terminales.join(', ') || 'sin datos'
    }.`,
    margen + 3,
    y + 5
  )
  doc.text(
    'Los umbrales de alerta se calculan sobre la mediana histórica del propio colaborador dentro del período seleccionado.',
    margen + 3,
    y + 9
  )

  pie()

  const nombreArchivo = `Rendimiento_${analisis.nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}_${dayjs().format('YYYYMMDD_HHmm')}.pdf`

  doc.save(nombreArchivo)
  return doc
}
