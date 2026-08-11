import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Dayjs } from 'dayjs'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import {
  MODULOS,
  MODULOS_CONFIGURABLES,
  type ModuloClave,
} from '@/constants/modulos'
import {
  desdeFila,
  haciaFila,
  moduloAplicaEn,
  programacionPorDefecto,
  type FilaModuloConfig,
  type ProgramacionModulo,
} from '@/lib/programacion'

const CLAVE_CACHE = ['modulos-config'] as const

/**
 * Configuración de los módulos de inspección.
 *
 * Si la tabla `modulos_config` todavía no existe —el script SQL se ejecuta
 * aparte— la consulta falla y se responde con todos los módulos activos. Es
 * deliberado: una app que deja de poder inspeccionar buses porque falta una
 * tabla de preferencias es peor que una que ignora las preferencias.
 */
const cargarConfiguracion = async (): Promise<{
  programaciones: ProgramacionModulo[]
  disponible: boolean
}> => {
  const { data, error } = await supabase
    .from('modulos_config')
    .select('clave, activo, tipo, semanas_mes, dias_semana, meses, vigente_desde, vigente_hasta, orden')

  if (error) {
    // El respaldo "todos activos" existe SÓLO para cuando la tabla aún no se
    // ha creado. Aplicarlo a cualquier error hacía que un corte de red
    // reactivara en silencio módulos que el supervisor había apagado, y el
    // formulario los volvía a pedir. Un error transitorio se relanza: react
    // query reintenta y, si hay datos en caché, los conserva.
    const tablaAusente =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      /does not exist|schema cache/i.test(error.message ?? '')
    if (!tablaAusente) throw error

    console.warn(
      'modulos_config no existe todavía; se asumen todos los módulos activos.',
      error.message
    )
    return {
      programaciones: MODULOS.map((modulo) =>
        programacionPorDefecto(modulo.clave, modulo.orden)
      ),
      disponible: false,
    }
  }

  const filas = (data ?? []) as unknown as FilaModuloConfig[]
  const guardadas = new Map(filas.map((fila) => [fila.clave, desdeFila(fila)]))

  // Un módulo nuevo en el código todavía no tiene fila: entra activo por
  // defecto en lugar de desaparecer del formulario sin avisar.
  return {
    programaciones: MODULOS.map(
      (modulo) =>
        guardadas.get(modulo.clave) ?? programacionPorDefecto(modulo.clave, modulo.orden)
    ),
    disponible: true,
  }
}

export const useModulosConfig = () => {
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: CLAVE_CACHE,
    queryFn: cargarConfiguracion,
    staleTime: 30_000,
    // El alcance de la revisión manda sobre qué se pide en el formulario:
    // una sesión abierta toda la jornada no puede quedarse con la
    // configuración de la mañana. El canal realtime la refresca al instante
    // y esto es la red de seguridad si ese canal no está publicado.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const guardar = useMutation({
    mutationFn: async (programacion: ProgramacionModulo) => {
      const { error } = await supabase.from('modulos_config').upsert(
        {
          ...haciaFila(programacion),
          actualizado_en: new Date().toISOString(),
          actualizado_por: null,
        },
        { onConflict: 'clave' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLAVE_CACHE })
    },
  })

  const porClave = useMemo(() => {
    const mapa = new Map<ModuloClave, ProgramacionModulo>()
    ;(consulta.data?.programaciones ?? []).forEach((programacion) => {
      mapa.set(programacion.clave, programacion)
    })
    return mapa
  }, [consulta.data])

  return {
    programaciones: consulta.data?.programaciones ?? [],
    porClave,
    /** `false` cuando la tabla aún no existe en la base de datos */
    disponible: consulta.data?.disponible ?? false,
    cargando: consulta.isLoading,
    /** La consulta falló y no hay caché: se está mostrando todo por defecto */
    fallo: consulta.isError && !consulta.data,
    guardar,
    configurables: MODULOS_CONFIGURABLES,
  }
}

export interface ModuloVigente {
  clave: ModuloClave
  aplica: boolean
  motivo?: string
}

/**
 * Qué módulos corresponden hoy (o en la fecha dada). Lo usan el formulario,
 * para armar sus pasos, y el dashboard, para saber qué está midiendo.
 */
export const useModulosVigentes = (fechaISO?: string) => {
  const { porClave, disponible, cargando, fallo } = useModulosConfig()

  // La fecha viaja como texto, no como objeto Dayjs: `dayjs()` devuelve una
  // instancia nueva en cada render y el memo se invalidaría siempre, con lo
  // que los pasos del formulario se recalcularían en cada pulsación.
  const dia = fechaISO ?? dayjs().format('YYYY-MM-DD')

  const vigentes = useMemo(() => {
    const fecha: Dayjs = dayjs(dia)

    return MODULOS.map((modulo) => {
      const programacion =
        porClave.get(modulo.clave) ?? programacionPorDefecto(modulo.clave, modulo.orden)
      // Los pasos fijos —Estado y Cierre— sostienen el formulario y no se
      // pueden apagar: sin ellos no habría dónde identificar el bus ni enviar.
      if (modulo.fijo) return { clave: modulo.clave, aplica: true }
      const resultado = moduloAplicaEn(programacion, fecha)
      return { clave: modulo.clave, aplica: resultado.aplica, motivo: resultado.motivo }
    })
  }, [porClave, dia])

  const clavesActivas = useMemo(
    () => new Set(vigentes.filter((item) => item.aplica).map((item) => item.clave)),
    [vigentes]
  )

  return { vigentes, clavesActivas, disponible, cargando, fallo }
}
