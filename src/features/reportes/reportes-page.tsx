import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { exportAllModulesToXlsx, exportExecutivePdf } from '@/lib/exporters'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const ReportesPage = () => {
  const [processing, setProcessing] = useState(false)

  const downloadWorkbook = async () => {
    setProcessing(true)
    try {
      await exportAllModulesToXlsx()
    } catch (error) {
      console.error('No pudimos generar el XLSX', error)
    } finally {
      setProcessing(false)
    }
  }

  const downloadPdf = async () => {
    setProcessing(true)
    try {
      await exportExecutivePdf()
    } catch (error) {
      console.error('No pudimos generar el PDF', error)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-brand-500">Reportes</p>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white">
          Exportaciones avanzadas
        </h2>
        <p className="text-sm text-slate-500">
          Descarga toda la data organizada por módulo listo para auditorías.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Button
          className="gap-2 rounded-2xl"
          onClick={downloadWorkbook}
          disabled={processing}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          XLSX completo
        </Button>
        <Button
          className="gap-2 rounded-2xl"
          variant="outline"
          onClick={downloadPdf}
          disabled={processing}
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          PDF ejecutivo
        </Button>
      </div>
    </Card>
  )
}
