import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'

const SHEETS = [
  'revisiones',
  'tags',
  'camaras',
  'extintores',
  'mobileye',
  'odometro',
  'publicidad',
  'tickets',
] as const

export const exportAllModulesToXlsx = async () => {
  const workbook = new ExcelJS.Workbook()
  await Promise.all(
    SHEETS.map(async (table) => {
      const sheet = workbook.addWorksheet(table.toUpperCase())
      const { data } = await supabase.from(table).select('*')
      if (!data || !data.length) {
        sheet.addRow(['Sin datos disponibles'])
        return
      }
      sheet.columns = Object.keys(data[0] ?? {}).map((key) => ({
        header: key,
        key,
        width: 20,
      }))
      data.forEach((row) => sheet.addRow(row))
    })
  )
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `mini-check_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
  link.click()
  window.URL.revokeObjectURL(url)
}

export const exportExecutivePdf = async () => {
  const { data: tickets } = await supabase.from('tickets').select('estado')
  const totals =
    tickets?.reduce<Record<string, number>>((acc, ticket) => {
      acc[ticket.estado] = (acc[ticket.estado] ?? 0) + 1
      return acc
    }, {}) ?? {}
  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text('Informe ejecutivo Mini-Check', 14, 20)
  doc.setFontSize(12)
  doc.text(`Fecha: ${dayjs().format('DD MMM YYYY HH:mm')}`, 14, 30)
  Object.entries(totals).forEach(([estado, value], index) => {
    doc.text(`${estado}: ${value}`, 14, 50 + index * 10)
  })
  doc.save(`mini-check_${dayjs().format('YYYYMMDD_HHmm')}.pdf`)
}
