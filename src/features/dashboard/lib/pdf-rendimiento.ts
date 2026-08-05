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
const VERDE = [22, 163, 74] as const
const AMBAR = [217, 119, 6] as const
const ROJO = [220, 38, 38] as const

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

/** Verde / ámbar / rojo según el valor supere o no cada corte. */
const semaforo = (valor: number, bien: number, regular: number) =>
  valor >= bien ? VERDE : valor >= regular ? AMBAR : ROJO

/**
 * Informe de rendimiento de un colaborador.
 *
 * Está pensado para decidir, no para archivar: abre con un veredicto y las
 * acciones sugeridas, y sólo después baja al detalle que las respalda. Toda
 * medida de ritmo se calcula dentro del turno —nunca de punta a punta del
 * día—, porque el hueco entre el último bus de un turno y el primero del
 * siguiente es descanso y mezclarlo falseaba las cifras.
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
    doc.setFontSize(6.6)
    doc.setTextColor(...SUAVE)
    doc.text(
      `Mini-Check · Chequeo de rendimiento · ${analisis.periodoEtiqueta}`,
      margen,
      yPie + 4
    )
    const derecha = `${analisis.nombre} · pág. ${pagina}`
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

  const reservar = (necesario: number) => {
    if (y + necesario > alto - 16) nuevaPagina()
  }

  const titulo = (texto: string, subtitulo?: string) => {
    if (pagina > 0 && y > margen + 6) y += 5
    // Se reserva sitio para el título Y para algo de contenido: si sólo se
    // reservara el título, éste podría quedar solo al pie de la página con
    // su sección entera en la siguiente.
    reservar(subtitulo ? 42 : 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...TINTA)
    const mayus = texto.toLocaleUpperCase('es')
    doc.text(mayus, margen, y)
    doc.setDrawColor(...MARCA)
    doc.setLineWidth(0.8)
    doc.line(margen, y + 1.6, margen + doc.getTextWidth(mayus), y + 1.6)
    y += 6
    if (subtitulo) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...SUAVE)
      doc.text(subtitulo, margen, y)
      y += 4.5
    } else {
      y += 1
    }
  }

  const parrafo = (texto: string, tamano = 8) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tamano)
    doc.setTextColor(...SUAVE)
    const lineas = doc.splitTextToSize(texto, util) as string[]
    reservar(lineas.length * (tamano * 0.42) + 2)
    doc.text(lineas, margen, y)
    y += lineas.length * (tamano * 0.42) + 2.5
  }

  const tarjetas = (
    datos: Array<{
      etiqueta: string
      valor: string
      nota?: string
      color?: readonly [number, number, number]
    }>,
    columnas = 4
  ) => {
    const filas = Math.ceil(datos.length / columnas)
    const anchoCelda = util / columnas
    const altoCelda = 18
    reservar(filas * altoCelda + 2)

    datos.forEach((dato, indice) => {
      const columna = indice % columnas
      const fila = Math.floor(indice / columnas)
      const x = margen + columna * anchoCelda
      const yCelda = y + fila * altoCelda

      doc.setFillColor(...FONDO)
      doc.roundedRect(x, yCelda, anchoCelda - 2, altoCelda - 2.5, 1.6, 1.6, 'F')

      if (dato.color) {
        doc.setFillColor(dato.color[0], dato.color[1], dato.color[2])
        doc.roundedRect(x, yCelda, 1.4, altoCelda - 2.5, 0.7, 0.7, 'F')
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.2)
      doc.setTextColor(...SUAVE)
      doc.text(dato.etiqueta.toLocaleUpperCase('es'), x + 3.5, yCelda + 4.6)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12.5)
      if (dato.color) doc.setTextColor(dato.color[0], dato.color[1], dato.color[2])
      else doc.setTextColor(...TINTA)
      doc.text(dato.valor, x + 3.5, yCelda + 11)

      if (dato.nota) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.9)
        doc.setTextColor(...SUAVE)
        const nota = doc.splitTextToSize(dato.nota, anchoCelda - 7) as string[]
        doc.text(nota.slice(0, 1), x + 3.5, yCelda + 14.4)
      }
    })

    y += filas * altoCelda + 2
  }

  const barras = (
    datos: Array<{ etiqueta: string; valor: number; resaltado?: boolean; alerta?: boolean }>,
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
        if (dato.alerta) doc.setFillColor(...ROJO)
        else if (dato.resaltado) doc.setFillColor(...MARCA)
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
      } else if (dato.alerta) {
        // Sin barra que pintar: se marca el cero con un punto rojo
        doc.setFillColor(...ROJO)
        doc.circle(margen + anchoEtiqueta + 1.6, yFila + 2.4, 1.1, 'F')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.2)
      doc.setTextColor(...TINTA)
      const texto = `${dato.valor}${sufijo}`
      doc.text(texto, ancho - margen - doc.getTextWidth(texto), yFila + 3.4)
    })

    y += datos.length * altoFila + 3
  }

  const tabla = (
    cabeceras: string[],
    filas: Array<{ celdas: string[]; destacar?: boolean }>,
    anchos: number[],
    alineacionDerecha: number[] = []
  ) => {
    const altoFila = 5.4

    const dibujarCabecera = () => {
      reservar(altoFila * 3)
      doc.setFillColor(...TINTA)
      doc.rect(margen, y, util, altoFila, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.4)
      doc.setTextColor(255, 255, 255)
      let x = margen
      cabeceras.forEach((cabecera, indice) => {
        const texto = cabecera.toLocaleUpperCase('es')
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.7)
        } else {
          doc.text(texto, x + 2, y + 3.7)
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

      if (fila.destacar) {
        doc.setFillColor(254, 243, 232)
        doc.rect(margen, y, util, altoFila, 'F')
      } else if (indiceFila % 2 === 0) {
        doc.setFillColor(...FONDO)
        doc.rect(margen, y, util, altoFila, 'F')
      }

      doc.setFont('helvetica', fila.destacar ? 'bold' : 'normal')
      doc.setFontSize(6.9)
      doc.setTextColor(...TINTA)
      let x = margen
      fila.celdas.forEach((celda, indice) => {
        const disponible = anchos[indice] - 4
        let texto = celda
        while (doc.getTextWidth(texto) > disponible && texto.length > 1) {
          texto = `${texto.slice(0, -2)}…`
        }
        if (alineacionDerecha.includes(indice)) {
          doc.text(texto, x + anchos[indice] - 2 - doc.getTextWidth(texto), y + 3.7)
        } else {
          doc.text(texto, x + 2, y + 3.7)
        }
        x += anchos[indice]
      })
      y += altoFila
    })

    y += 3
  }

  /* ------------------------------------------------------ Portada ejecutiva */

  nuevaPagina()

  const altoCabecera = 36
  doc.setFillColor(...TINTA)
  doc.rect(0, 0, ancho, altoCabecera, 'F')
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ancho, 2.6, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(160, 174, 198)
  doc.text('CHEQUEO DE RENDIMIENTO DEL COLABORADOR', margen, 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text(analisis.nombre, margen, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  doc.setTextColor(160, 174, 198)
  doc.text(`RUT ${analisis.rut}   |   ${analisis.periodoEtiqueta}`, margen, 26)
  doc.text(
    `${dayjs(analisis.desde).format('DD/MM/YYYY')} – ${dayjs(analisis.hasta).format(
      'DD/MM/YYYY'
    )}   |   Terminales: ${analisis.terminales.join(', ') || 'sin datos'}`,
    margen,
    30.5
  )

  // Bloque de nota, a la derecha
  const colorNota = semaforo(analisis.puntuacion, 85, 60)
  doc.setFillColor(colorNota[0], colorNota[1], colorNota[2])
  doc.roundedRect(ancho - margen - 38, 7, 38, 22, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  const nota = String(analisis.puntuacion)
  doc.text(nota, ancho - margen - 19 - doc.getTextWidth(nota) / 2, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.4)
  const etiquetaNota = analisis.notaGlobal.toLocaleUpperCase('es')
  doc.text(
    etiquetaNota,
    ancho - margen - 19 - doc.getTextWidth(etiquetaNota) / 2,
    24
  )

  y = altoCabecera + 8

  /* ------------------------------------------------------------- Veredicto */

  titulo('Lectura ejecutiva', 'Lo que hay que saber antes de bajar al detalle')

  analisis.conclusiones.forEach((frase) => {
    // El troceado usa la fuente activa: hay que fijarla ANTES de partir el
    // texto o las líneas se calculan con un tamaño y se pintan con otro,
    // y la última palabra se sale del margen.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const lineas = doc.splitTextToSize(frase, util - 7) as string[]
    reservar(lineas.length * 3.5 + 3)
    doc.setFillColor(...MARCA)
    doc.circle(margen + 1.4, y - 1.1, 0.9, 'F')
    doc.setTextColor(...TINTA)
    doc.text(lineas, margen + 5, y)
    y += lineas.length * 3.5 + 2
  })

  y += 2

  /* --------------------------------------------------------- Indicadores */

  titulo('Indicadores clave', 'El color marca si el valor está dentro de lo esperado')

  const coberturaPct = Math.round(analisis.cobertura)
  const precision = analisis.precisionGps

  tarjetas([
    {
      etiqueta: 'Revisiones',
      valor: String(analisis.total),
      nota: `${analisis.busesDistintos} buses distintos`,
    },
    {
      etiqueta: 'Cobertura de días',
      valor: `${coberturaPct} %`,
      nota: `${analisis.diasActivos} de ${analisis.diasLaborables} laborables`,
      color: semaforo(coberturaPct, 85, 60),
    },
    {
      etiqueta: 'Turnos trabajados',
      valor: String(analisis.patron.totalTurnos),
      nota: `${analisis.patron.turnosDia} de día · ${analisis.patron.turnosNoche} de noche`,
    },
    {
      etiqueta: 'Horas en terreno',
      valor: `${analisis.horasTrabajadas} h`,
      nota: `${formatearMinutos(analisis.patron.duracionMedianaMin)} por turno`,
    },
    {
      etiqueta: 'Revisiones por turno',
      valor: String(analisis.patron.revisionesPorTurno ?? '—'),
      nota: `${analisis.patron.ritmoMedioPorHora ?? '—'} por hora efectiva`,
    },
    {
      etiqueta: 'Entre revisiones',
      valor: formatearMinutos(analisis.cadenciaMedianaMin),
      nota: 'mediana dentro del turno',
    },
    {
      etiqueta: 'Ubicación válida',
      valor: precision !== null ? `${precision.toFixed(0)} %` : '—',
      nota:
        analisis.distanciaMediaM !== null
          ? `a ${analisis.distanciaMediaM} m del terminal`
          : 'sin GPS',
      color: precision !== null ? semaforo(precision, 90, 70) : undefined,
    },
    {
      etiqueta: 'Buses operativos',
      valor:
        analisis.tasaOperativa !== null ? `${analisis.tasaOperativa.toFixed(0)} %` : '—',
      nota: `${analisis.enPanne} detectados en panne`,
    },
  ])

  /* ---------------------------------------------------------- Patrón horario */

  titulo(
    'Patrón de turnos',
    'Ritmo medido entre la primera y la última revisión de cada turno, no de punta a punta del día'
  )

  if (analisis.patron.totalTurnos === 0) {
    parrafo('No hay turnos registrados en el período.')
  } else {
    const dominante =
      analisis.patron.turnoDominante === 'dia'
        ? 'predominantemente de día'
        : analisis.patron.turnoDominante === 'noche'
          ? 'predominantemente de noche'
          : 'alternando día y noche'

    parrafo(
      `Trabaja ${dominante}. El descanso entre turnos no se contabiliza como pausa: sólo se miden los huecos dentro de una misma jornada de trabajo.`
    )

    // Cada tipo de turno se resume por separado: el horario medio entre un
    // turno de mañana y uno de noche daría una hora que nunca existió.
    const filasHorario = (['dia', 'noche'] as const)
      .filter((tipo) => analisis.patron.horarios[tipo].turnos > 0)
      .map((tipo) => {
        const horario = analisis.patron.horarios[tipo]
        return {
          celdas: [
            tipo === 'dia' ? 'Turno de día' : 'Turno de noche',
            String(horario.turnos),
            horario.entrada ?? '—',
            horario.salida ?? '—',
            formatearMinutos(horario.duracionMedianaMin),
            String(horario.revisionesPorTurno ?? '—'),
          ],
        }
      })

    tabla(
      ['Tipo', 'Turnos', 'Entrada típica', 'Salida típica', 'Duración típica', 'Rev./turno'],
      filasHorario,
      [40, 22, 32, 32, 34, 28],
      [1, 5]
    )

    tarjetas(
      [
        {
          etiqueta: 'Ritmo efectivo',
          valor:
            analisis.patron.ritmoMedioPorHora !== null
              ? `${analisis.patron.ritmoMedioPorHora}/h`
              : '—',
          nota: 'revisiones por hora en turno',
        },
        {
          etiqueta: 'Entre revisiones',
          valor: formatearMinutos(analisis.cadenciaMedianaMin),
          nota: 'mediana dentro del turno',
        },
        {
          etiqueta: 'Pausa máxima en turno',
          valor: formatearMinutos(analisis.pausaMaximaMin),
          nota: analisis.pausaMaximaTurno
            ? `${dayjs(analisis.pausaMaximaTurno.fechaJornada).format('DD MMM')} · turno de ${
                analisis.pausaMaximaTurno.tipo === 'noche' ? 'noche' : 'día'
              }`
            : 'sin pausas relevantes',
        },
        {
          etiqueta: 'Horas en terreno',
          valor: `${analisis.horasTrabajadas} h`,
          nota: `${analisis.patron.totalTurnos} turnos`,
        },
      ],
      4
    )

    barras(
      analisis.porFranja.map((franja) => ({
        etiqueta: franja.etiqueta,
        valor: franja.revisiones,
      }))
    )
  }

  /* ------------------------------------------------------- Evolución semanal */

  titulo('Evolución semanal', 'En rojo, las semanas sin ninguna revisión')
  if (analisis.porSemana.length === 0) {
    parrafo('No hay semanas dentro del período analizado.')
  } else {
    barras(
      analisis.porSemana.map((semana) => ({
        etiqueta: `${semana.etiqueta}${semana.parcial ? ' (parcial)' : ''}`,
        valor: semana.revisiones,
        resaltado: semana.clave === analisis.mejorSemana?.clave,
        alerta: semana.ausente,
      }))
    )
  }

  barras(
    analisis.porDiaSemana.map((dia) => ({
      etiqueta: dia.etiqueta,
      valor: dia.revisiones,
    }))
  )

  /* -------------------------------------------------- Alertas con acción */

  titulo(
    `Alertas y acciones sugeridas (${analisis.alertas.length})`,
    'Ordenadas por severidad; cada una incluye qué comprobar'
  )

  const ordenSeveridad: Record<Severidad, number> = {
    critica: 0,
    alta: 1,
    media: 2,
    info: 3,
  }

  ;[...analisis.alertas]
    .sort((a, b) => ordenSeveridad[a.severidad] - ordenSeveridad[b.severidad])
    .forEach((alerta) => {
      // Igual que arriba: fijar la fuente antes de partir el texto
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.9)
      const lineasDetalle = doc.splitTextToSize(alerta.detalle, util - 10) as string[]
      const lineasAccion = alerta.accion
        ? (doc.splitTextToSize(`Acción: ${alerta.accion}`, util - 10) as string[])
        : []
      const altoBloque =
        7 + lineasDetalle.length * 3.2 + (lineasAccion.length ? lineasAccion.length * 3.2 + 1 : 0)

      reservar(altoBloque + 2)

      doc.setFillColor(...FONDO)
      doc.roundedRect(margen, y, util, altoBloque, 1.6, 1.6, 'F')

      const color = SEVERIDAD_COLOR[alerta.severidad]
      doc.setFillColor(color[0], color[1], color[2])
      doc.roundedRect(margen, y, 1.6, altoBloque, 0.8, 0.8, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.6)
      doc.setTextColor(color[0], color[1], color[2])
      doc.text(SEVERIDAD_ETIQUETA[alerta.severidad], margen + 4, y + 4.2)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(...TINTA)
      doc.text(alerta.titulo, margen + 21, y + 4.4)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.9)
      doc.setTextColor(...SUAVE)
      doc.text(lineasDetalle, margen + 4, y + 8.2)

      if (lineasAccion.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.9)
        doc.setTextColor(color[0], color[1], color[2])
        doc.text(lineasAccion, margen + 4, y + 8.2 + lineasDetalle.length * 3.2 + 1)
      }

      y += altoBloque + 2
    })

  /* ------------------------------------------------------- Detalle por turno */

  titulo(
    'Detalle turno a turno',
    'Cada fila es un turno completo. "Pausa máx." es el hueco más largo dentro de ese mismo turno'
  )

  if (analisis.turnos.length === 0) {
    parrafo('Sin turnos registrados en el período.')
  } else {
    const medianaTurno = analisis.patron.revisionesPorTurno ?? 0
    tabla(
      ['Jornada', 'Turno', 'Entrada', 'Salida', 'Duración', 'Rev.', 'Buses', 'Ritmo/h', 'Pausa máx.'],
      [...analisis.turnos]
        .sort((a, b) => b.inicio.localeCompare(a.inicio))
        .map((turno) => ({
          // Se resalta lo que merece una mirada: turnos con la mitad de
          // revisiones de lo normal o con una pausa de más de dos horas
          destacar:
            (medianaTurno > 0 && turno.revisiones < medianaTurno * 0.5) ||
            (turno.pausaMaxMin ?? 0) > 120,
          celdas: [
            dayjs(turno.fechaJornada).format('ddd DD MMM'),
            turno.tipo === 'noche' ? 'Noche' : 'Día',
            turno.inicioHora,
            `${turno.finHora}${turno.cruzaMedianoche ? ' +1' : ''}`,
            formatearMinutos(turno.duracionMin),
            String(turno.revisiones),
            String(turno.busesDistintos),
            turno.ritmoPorHora !== null ? String(turno.ritmoPorHora) : '—',
            formatearMinutos(turno.pausaMaxMin),
          ],
        })),
      [30, 15, 18, 20, 24, 13, 15, 20, 33],
      [5, 6, 7, 8]
    )
  }

  /* ------------------------------------------------------- Días sin registro */

  if (analisis.diasAusentes.length > 0) {
    titulo(
      `Días laborables sin registro (${analisis.diasAusentes.length})`,
      'El domingo no se considera laborable. Un turno de noche se imputa al día en que empezó'
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

  /* ------------------------------------------------------------ Metodología */

  titulo('Cómo leer este informe')
  parrafo(
    'Un turno es un bloque continuo de revisiones. Se cierra cuando pasan más de 5 horas sin actividad, porque ese hueco es descanso entre jornadas y no ritmo de trabajo: contarlo como pausa producía cifras imposibles, del tipo "18 horas entre dos revisiones".'
  )
  parrafo(
    'Las revisiones anteriores a las 06:00 se imputan al turno que empezó la noche anterior, de modo que un turno nocturno cuenta como un solo día trabajado y no como dos.'
  )
  parrafo(
    `La puntuación combina constancia diaria (${Math.round(
      analisis.componentes[0].peso * 100
    )} %), volumen sostenido (${Math.round(
      analisis.componentes[1].peso * 100
    )} %), ubicación válida (${Math.round(
      analisis.componentes[2].peso * 100
    )} %) y regularidad semanal (${Math.round(
      analisis.componentes[3].peso * 100
    )} %). Los umbrales de "poco volumen" salen de la mediana del propio colaborador dentro del período, no de una cifra fija para todos.`
  )

  barras(
    analisis.componentes.map((componente) => ({
      etiqueta: `${componente.etiqueta} (${Math.round(componente.peso * 100)} %)`,
      valor: componente.valor,
      resaltado: componente.valor >= 80,
    })),
    ' pts'
  )

  reservar(12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.4)
  doc.setTextColor(...SUAVE)
  doc.text(
    `Informe generado el ${dayjs().format(
      'DD/MM/YYYY [a las] HH:mm'
    )} hrs sobre ${analisis.total} revisiones y ${analisis.patron.totalTurnos} turnos registrados.`,
    margen,
    y + 3
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
