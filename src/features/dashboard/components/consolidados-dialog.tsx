import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ClipboardPaste,
  DownloadCloud,
  FileSpreadsheet,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
// Sólo lo ligero se importa de forma estática. `exportConsolidadosSemanales`
// arrastra ExcelJS (~940 kB) y se carga al pulsar "Generar", no al abrir.
import {
  loadRevisionSemanal,
  parseTablaWeb,
  type MergeStats,
} from '@/lib/consolidados-datos'

interface ConsolidadosDialogProps {
  open: boolean
  onClose: () => void
  startISO: string
  endISO: string
  weekNumber: number
  year: number
}

const FILES = [
  { name: 'CAMARAS para CONSOLIDADO.xlsx', detail: '0 = sin dato · 1 = con problema', color: 'bg-blue-500' },
  { name: 'MOBILEYES para CONSOLIDADO.xlsx', detail: 'Solo flota Volvo · TIENE / DAÑADO', color: 'bg-amber-600' },
  { name: 'TAG para CONSOLIDADO.xlsx', detail: 'TAG y serie por patente', color: 'bg-yellow-400' },
  { name: 'Revision Semanal Recursos.xlsx', detail: 'Se actualiza con la tabla pegada', color: 'bg-emerald-500' },
]

export const ConsolidadosDialog = ({
  open,
  onClose,
  startISO,
  endISO,
  weekNumber,
  year,
}: ConsolidadosDialogProps) => {
  const [pastedText, setPastedText] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<MergeStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedPreview = useMemo(
    () => (pastedText.trim() ? parseTablaWeb(pastedText) : []),
    [pastedText]
  )

  const storedCount = loadRevisionSemanal().length

  // Bloquear el scroll de la página mientras el modal está abierto
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    setResult(null)
    try {
      const { exportConsolidadosSemanales } = await import('@/lib/consolidados')
      const stats = await exportConsolidadosSemanales({
        startISO,
        endISO,
        weekNumber,
        year,
        pastedText,
      })
      setResult(stats)
      setPastedText('')
    } catch (err) {
      console.error('Error exportando consolidados', err)
      setError('No se pudieron generar los archivos. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-md sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-panel-strong flex h-[100dvh] w-full flex-col overflow-hidden shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="relative bg-gradient-to-r from-brand-700 to-brand-500 px-4 pb-4 text-white sm:px-6 sm:pb-5 dialog-header-safe">
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar consolidados semanales"
                className="dialog-close-safe absolute right-4 rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/15 p-2.5">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Consolidados semanales</h2>
                  <p className="text-sm text-white/80">
                    Semana {weekNumber} de {year} · 4 archivos XLSX con formato oficial
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
              {/* Archivos que se descargarán */}
              <div className="grid gap-2 sm:grid-cols-2">
                {FILES.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/70 px-3 py-2.5 dark:border-slate-800"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${file.color}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {file.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{file.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pegado de tabla web para Revisión Semanal */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4 text-brand-500" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Revisión Semanal · pega aquí la tabla de la web
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {storedCount} buses guardados
                  </span>
                </div>
                <Textarea
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={
                    'Copia las filas desde la página web y pégalas aquí.\nEj: 1 [+] Panne en ruta  LXWP76  1694  523779  US6 ER  T1318  ER  22/10/2025 23:56  237  F/S  Abierta'
                  }
                  className="min-h-[120px] font-mono text-xs"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                  Las patentes que ya están en la lista actualizan su fecha y días fuera de
                  servicio; las nuevas se agregan con los datos de la flota. Si no pegas nada, el
                  archivo se genera con la lista guardada.
                </p>
                {pastedText.trim() && (
                  <div
                    className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${
                      parsedPreview.length > 0
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {parsedPreview.length > 0
                      ? `✓ ${parsedPreview.length} patentes detectadas: ${parsedPreview
                          .map((row) => row.ppu)
                          .join(', ')}`
                      : 'No se detectaron patentes en el texto pegado. Revisa que copiaste las filas completas.'}
                  </div>
                )}
              </div>

              {/* Resultado */}
              {result && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    4 archivos descargados
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-white/70 px-2 py-1.5 dark:bg-slate-900/50">
                      <p className="text-base font-bold text-slate-800 dark:text-white">
                        {result.nuevas.length}
                      </p>
                      <p className="text-slate-500">nuevas</p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-2 py-1.5 dark:bg-slate-900/50">
                      <p className="text-base font-bold text-slate-800 dark:text-white">
                        {result.actualizadas.length}
                      </p>
                      <p className="text-slate-500">actualizadas</p>
                    </div>
                    <div className="rounded-xl bg-white/70 px-2 py-1.5 dark:bg-slate-900/50">
                      <p className="text-base font-bold text-slate-800 dark:text-white">
                        {result.sinAparecer.length}
                      </p>
                      <p className="text-slate-500">sin aparecer</p>
                    </div>
                  </div>
                  {result.sinAparecer.length > 0 && (
                    <p className="mt-2 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                      Sin aparecer en el pegado (se conservan): {result.sinAparecer.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Pie */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">
              <p className="hidden text-[11px] text-slate-400 sm:block">
                El navegador puede pedir permiso para descargar varios archivos.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={downloading}>
                  Cerrar
                </Button>
                <Button
                  className="gap-2 rounded-2xl"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="h-4 w-4" />
                  )}
                  {downloading ? 'Generando…' : 'Descargar 4 archivos'}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
