import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Database,
  Info,
  Loader2,
  Save,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import { Card, CardEyebrow, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useModulosConfig } from '@/hooks/use-modulos-config'
import {
  describirProgramacion,
  moduloAplicaEn,
  proximasFechas,
  type ProgramacionModulo,
} from '@/lib/programacion'
import { useNotificationStore } from '@/store/notification-store'
import type { DefinicionModulo } from '@/constants/modulos'

const SEMANAS = [
  { valor: 1, etiqueta: '1ª' },
  { valor: 2, etiqueta: '2ª' },
  { valor: 3, etiqueta: '3ª' },
  { valor: 4, etiqueta: '4ª' },
  { valor: 5, etiqueta: '5ª' },
]

const DIAS = [
  { valor: 1, etiqueta: 'Lun' },
  { valor: 2, etiqueta: 'Mar' },
  { valor: 3, etiqueta: 'Mié' },
  { valor: 4, etiqueta: 'Jue' },
  { valor: 5, etiqueta: 'Vie' },
  { valor: 6, etiqueta: 'Sáb' },
  { valor: 7, etiqueta: 'Dom' },
]

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

const alternar = (lista: number[], valor: number) =>
  lista.includes(valor) ? lista.filter((n) => n !== valor) : [...lista, valor].sort((a, b) => a - b)

export const ModulosAdmin = () => {
  const { porClave, disponible, cargando, guardar, configurables } =
    useModulosConfig()
  const push = useNotificationStore((state) => state.push)
  const [abierto, setAbierto] = useState<string | null>(null)

  const hoy = dayjs()
  const activosHoy = configurables.filter((modulo) => {
    const programacion = porClave.get(modulo.clave)
    return programacion ? moduloAplicaEn(programacion, hoy).aplica : true
  }).length

  if (cargando) {
    return (
      <Card className="flex min-h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardEyebrow>Formulario de inspección</CardEyebrow>
            <CardTitle>Qué se revisa y cuándo</CardTitle>
            <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
              Enciende o apaga cada módulo del formulario, o prográmalo para que
              aparezca sólo en determinadas semanas del mes. La regla se repite mes
              a mes hasta que la cambies.
            </p>
          </div>
          <Badge variant={activosHoy > 0 ? 'success' : 'warning'} className="shrink-0">
            {activosHoy} activos hoy
          </Badge>
        </div>

        {!disponible && (
          <div className="flex items-start gap-2 rounded-[var(--app-radius-sm)] border border-amber-300/60 bg-amber-50/70 p-2.5 dark:border-amber-500/25 dark:bg-amber-950/25">
            <Database className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-amber-800 dark:text-amber-200">
                Falta crear la tabla de configuración
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                Mientras tanto todos los módulos aparecen en el formulario y los
                cambios de esta pantalla no se guardarán. Ejecuta el script{' '}
                <span className="font-mono">sql-scripts/modulos-configurables.sql</span>{' '}
                en el editor SQL de Supabase.
              </p>
            </div>
          </div>
        )}
      </Card>

      {configurables.map((modulo) => {
        const programacion = porClave.get(modulo.clave)
        if (!programacion) return null
        return (
          <FilaModulo
            key={modulo.clave}
            modulo={modulo}
            programacion={programacion}
            expandido={abierto === modulo.clave}
            onExpandir={() =>
              setAbierto((prev) => (prev === modulo.clave ? null : modulo.clave))
            }
            deshabilitado={!disponible}
            onGuardar={async (siguiente) => {
              try {
                await guardar.mutateAsync(siguiente)
                push({
                  id: `modulo-${siguiente.clave}-${Date.now()}`,
                  type: 'success',
                  title: `${modulo.nombre} actualizado`,
                  body: describirProgramacion(siguiente),
                })
              } catch (error) {
                push({
                  id: `modulo-error-${Date.now()}`,
                  type: 'error',
                  title: 'No se pudo guardar',
                  body:
                    error instanceof Error
                      ? error.message
                      : 'Revisa la conexión e inténtalo de nuevo',
                })
              }
            }}
          />
        )
      })}

      <p className="px-1 text-[10.5px] leading-snug text-slate-400">
        Estado y Cierre no aparecen en esta lista: sostienen el formulario —identificar
        el bus y enviar la revisión— y no se pueden desactivar. Los módulos que exigen
        el bus encendido se omiten solos cuando la revisión se marca en panne.
      </p>
    </div>
  )
}

interface FilaModuloProps {
  modulo: DefinicionModulo
  programacion: ProgramacionModulo
  expandido: boolean
  deshabilitado: boolean
  onExpandir: () => void
  onGuardar: (programacion: ProgramacionModulo) => Promise<void>
}

const FilaModulo = ({
  modulo,
  programacion,
  expandido,
  deshabilitado,
  onExpandir,
  onGuardar,
}: FilaModuloProps) => {
  const [borrador, setBorrador] = useState<ProgramacionModulo>(programacion)
  const [guardando, setGuardando] = useState(false)

  // Si la configuración cambia por fuera (otra pestaña, otro supervisor) el
  // borrador se resincroniza mientras el panel esté cerrado.
  useEffect(() => {
    if (!expandido) setBorrador(programacion)
  }, [programacion, expandido])

  const Icono = modulo.icono
  const hoy = dayjs()
  const aplicaHoy = moduloAplicaEn(borrador, hoy)
  const sucio = JSON.stringify(borrador) !== JSON.stringify(programacion)
  const proximas = proximasFechas(borrador, 4)

  const aplicar = async () => {
    setGuardando(true)
    await onGuardar(borrador)
    setGuardando(false)
  }

  return (
    <Card className="!p-0">
      <div className="flex items-center gap-2.5 p-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br text-white shadow-sm',
            modulo.acento,
            !borrador.activo && 'opacity-40 grayscale'
          )}
        >
          <Icono className="h-4 w-4" />
        </span>

        <button
          type="button"
          onClick={onExpandir}
          className="min-w-0 flex-1 text-left"
          aria-expanded={expandido}
        >
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13.5px] font-extrabold tracking-[-0.02em] text-slate-950 dark:text-white">
              {modulo.nombre}
            </p>
            {borrador.activo && aplicaHoy.aplica ? (
              <Badge variant="success">Hoy sí</Badge>
            ) : (
              <Badge variant="outline">Hoy no</Badge>
            )}
          </div>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {describirProgramacion(borrador)}
          </p>
        </button>

        <Switch
          checked={borrador.activo}
          disabled={deshabilitado}
          aria-label={`Activar ${modulo.nombre}`}
          onCheckedChange={(valor) => {
            const siguiente = { ...borrador, activo: valor }
            setBorrador(siguiente)
            void onGuardar(siguiente)
          }}
        />

        <button
          type="button"
          onClick={onExpandir}
          aria-label="Programación"
          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-white/60 dark:hover:bg-white/10"
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', expandido && 'rotate-180')}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expandido && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-white/50 p-3 dark:border-white/[0.06]">
              <div className="flex items-start gap-2 rounded-[var(--app-radius-sm)] bg-white/50 p-2.5 dark:bg-white/[0.04]">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-brand-500" />
                <div className="min-w-0 space-y-1">
                  <p className="text-[11.5px] leading-snug text-slate-600 dark:text-slate-300">
                    {modulo.funcion}
                  </p>
                  {modulo.procedimiento && (
                    <p className="text-[10.5px] leading-snug text-slate-500 dark:text-slate-400">
                      <span className="font-bold">Procedimiento:</span>{' '}
                      {modulo.procedimiento}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400">
                    {modulo.obligatorioEnPanne
                      ? 'Se revisa también con el bus en panne.'
                      : modulo.requiereBusOperativo
                        ? 'Requiere el bus encendido: se omite si está en panne.'
                        : 'Opcional con el bus en panne.'}
                  </p>
                </div>
              </div>

              {/* Modo */}
              <div className="flex rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-1 dark:border-white/[0.06] dark:bg-white/[0.035]">
                {(
                  [
                    ['siempre', 'Siempre'],
                    ['programado', 'Programado'],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => setBorrador((prev) => ({ ...prev, tipo: valor }))}
                    className={cn(
                      'press-feedback flex-1 rounded-[calc(var(--app-radius-sm)-4px)] px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-40',
                      borrador.tipo === valor
                        ? 'bg-brand-500 text-white shadow-[0_6px_16px_-10px_var(--color-brand-600)]'
                        : 'text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>

              {borrador.tipo === 'programado' && (
                <div className="space-y-3">
                  <GrupoSeleccion
                    titulo="Semanas del mes"
                    ayuda="Los días 1-7 son la 1ª semana, 8-14 la 2ª, y así. Se repite cada mes."
                    opciones={SEMANAS}
                    seleccion={borrador.semanasDelMes}
                    deshabilitado={deshabilitado}
                    onAlternar={(valor) =>
                      setBorrador((prev) => ({
                        ...prev,
                        semanasDelMes: alternar(prev.semanasDelMes, valor),
                      }))
                    }
                  />

                  <GrupoSeleccion
                    titulo="Días de la semana"
                    ayuda="Déjalo vacío para todos los días."
                    opciones={DIAS}
                    seleccion={borrador.diasSemana}
                    deshabilitado={deshabilitado}
                    onAlternar={(valor) =>
                      setBorrador((prev) => ({
                        ...prev,
                        diasSemana: alternar(prev.diasSemana, valor),
                      }))
                    }
                  />

                  <GrupoSeleccion
                    titulo="Meses"
                    ayuda="Déjalo vacío para todos los meses."
                    opciones={MESES.map((etiqueta, indice) => ({
                      valor: indice + 1,
                      etiqueta,
                    }))}
                    seleccion={borrador.meses}
                    deshabilitado={deshabilitado}
                    onAlternar={(valor) =>
                      setBorrador((prev) => ({
                        ...prev,
                        meses: alternar(prev.meses, valor),
                      }))
                    }
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                        Vigente desde
                      </label>
                      <Input
                        type="date"
                        disabled={deshabilitado}
                        value={borrador.vigenteDesde ?? ''}
                        onChange={(evento) =>
                          setBorrador((prev) => ({
                            ...prev,
                            vigenteDesde: evento.target.value || null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                        Vigente hasta
                      </label>
                      <Input
                        type="date"
                        disabled={deshabilitado}
                        value={borrador.vigenteHasta ?? ''}
                        onChange={(evento) =>
                          setBorrador((prev) => ({
                            ...prev,
                            vigenteHasta: evento.target.value || null,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Vista previa: confirma que la regla hace lo que se cree */}
                  <div className="rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-brand-500" />
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        Próximas apariciones
                      </p>
                    </div>
                    {proximas.length === 0 ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Con estas condiciones el módulo no aparecería en todo un año.
                        Revisa la combinación.
                      </p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {proximas.map((fecha) => (
                          <span
                            key={fecha}
                            className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[10.5px] font-bold text-brand-700 dark:text-brand-300"
                          >
                            {dayjs(fecha).format('ddd DD MMM')}
                          </span>
                        ))}
                      </div>
                    )}
                    {!aplicaHoy.aplica && aplicaHoy.motivo && (
                      <p className="mt-1.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                        Hoy no aparece: {aplicaHoy.motivo.toLocaleLowerCase('es')}.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!sucio || guardando || deshabilitado}
                  onClick={() => void aplicar()}
                >
                  {guardando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Guardar programación
                </Button>
                {sucio && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBorrador(programacion)}
                  >
                    Descartar
                  </Button>
                )}
                {!sucio && !guardando && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Guardado
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

const GrupoSeleccion = ({
  titulo,
  ayuda,
  opciones,
  seleccion,
  deshabilitado,
  onAlternar,
}: {
  titulo: string
  ayuda: string
  opciones: Array<{ valor: number; etiqueta: string }>
  seleccion: number[]
  deshabilitado: boolean
  onAlternar: (valor: number) => void
}) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
      {titulo}
    </p>
    <p className="mb-1.5 text-[10px] text-slate-400">{ayuda}</p>
    <div className="flex flex-wrap gap-1">
      {opciones.map((opcion) => {
        const activo = seleccion.includes(opcion.valor)
        return (
          <button
            key={opcion.valor}
            type="button"
            disabled={deshabilitado}
            aria-pressed={activo}
            onClick={() => onAlternar(opcion.valor)}
            className={cn(
              'press-feedback min-w-[2.4rem] rounded-[10px] border px-2 py-1.5 text-[11px] font-bold transition disabled:opacity-40',
              activo
                ? 'border-brand-400/50 bg-brand-500 text-white'
                : 'border-white/60 bg-white/40 text-slate-600 dark:border-white/[0.07] dark:bg-white/[0.04] dark:text-slate-300'
            )}
          >
            {opcion.etiqueta}
          </button>
        )
      })}
    </div>
  </div>
)
