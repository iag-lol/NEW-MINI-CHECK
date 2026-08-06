import {
  BatteryCharging,
  Camera,
  ClipboardCheck,
  Flag,
  Flame,
  Gauge,
  HardDrive,
  Megaphone,
  Radar,
  Tag,
  Wifi,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo de módulos de inspección.
 *
 * Es la única fuente de verdad: el formulario arma sus pasos desde aquí, la
 * pantalla de Configuración lista lo que se puede activar o programar, y el
 * dashboard sabe qué contar y cómo llamarlo. Antes cada pantalla mantenía su
 * propia lista y bastaba añadir un módulo para que las tres se desalinearan.
 */

export type ModuloClave =
  | 'estado'
  | 'tag'
  | 'camaras'
  | 'extintores'
  | 'odometro'
  | 'mobileye'
  | 'rack'
  | 'wifi'
  | 'publicidad'
  | 'mas15'
  | 'cierre'

export interface DefinicionModulo {
  clave: ModuloClave
  /** Nombre corto, el que se ve en el paso del formulario */
  nombre: string
  /** Qué se revisa y para qué sirve: se muestra en Configuración y en el dashboard */
  funcion: string
  /** Procedimiento en terreno, cuando el módulo lo necesita */
  procedimiento?: string
  icono: LucideIcon
  acento: string
  /** Tabla donde se guarda el detalle. `null` para pasos que no persisten aparte */
  tabla: string | null
  /** Pasos de la estructura del formulario: no se pueden desactivar */
  fijo: boolean
  /** Se revisa igualmente cuando el bus está en panne */
  obligatorioEnPanne: boolean
  /** Requiere el bus operativo: se omite si está en panne */
  requiereBusOperativo: boolean
  orden: number
}

export const MODULOS: DefinicionModulo[] = [
  {
    clave: 'estado',
    nombre: 'Estado',
    funcion:
      'Identifica el bus, su terminal y si está operativo o en panne. Define el resto del flujo.',
    icono: ClipboardCheck,
    acento: 'from-brand-500 to-indigo-500',
    tabla: null,
    fijo: true,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 0,
  },
  {
    clave: 'tag',
    nombre: 'TAG',
    funcion:
      'Verifica la presencia y el número de serie del TAG de peaje instalado en el parabrisas.',
    icono: Tag,
    acento: 'from-amber-500 to-yellow-500',
    tabla: 'tags',
    fijo: false,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 10,
  },
  {
    clave: 'camaras',
    nombre: 'Cámaras',
    funcion:
      'Revisa el monitor y las cámaras de seguridad: imagen, activación por reversa y por puertas.',
    icono: Camera,
    acento: 'from-blue-500 to-sky-500',
    tabla: 'camaras',
    fijo: false,
    obligatorioEnPanne: false,
    requiereBusOperativo: true,
    orden: 20,
  },
  {
    clave: 'extintores',
    nombre: 'Extintor',
    funcion:
      'Controla vigencia de certificación, presión, manómetro, sonda, cilindro y portaextintor.',
    icono: Flame,
    acento: 'from-red-500 to-orange-500',
    tabla: 'extintores',
    fijo: false,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 30,
  },
  {
    clave: 'odometro',
    nombre: 'Odómetro',
    funcion: 'Registra la lectura de kilometraje y detecta lecturas inconsistentes o sin señal.',
    icono: Gauge,
    acento: 'from-teal-500 to-emerald-500',
    tabla: 'odometro',
    fijo: false,
    obligatorioEnPanne: false,
    requiereBusOperativo: true,
    orden: 40,
  },
  {
    clave: 'mobileye',
    nombre: 'Mobileye',
    funcion:
      'Comprueba consola y sensores del sistema de asistencia a la conducción (frontal y laterales).',
    icono: Radar,
    acento: 'from-purple-500 to-violet-500',
    tabla: 'mobileye',
    fijo: false,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 50,
  },
  {
    clave: 'rack',
    nombre: 'Rack',
    funcion:
      'Inspecciona el gabinete de equipos: disco duro, candado, cerraduras y seguridad adicional.',
    icono: HardDrive,
    acento: 'from-slate-500 to-slate-600',
    tabla: 'rack',
    fijo: false,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 60,
  },
  {
    clave: 'wifi',
    nombre: 'WiFi',
    funcion: 'Valida que el router entregue conexión a bordo con el bus encendido.',
    icono: Wifi,
    acento: 'from-sky-500 to-cyan-500',
    tabla: 'wifi',
    fijo: false,
    obligatorioEnPanne: false,
    requiereBusOperativo: true,
    orden: 70,
  },
  {
    clave: 'publicidad',
    nombre: 'Publicidad',
    funcion:
      'Registra la campaña publicitaria por lateral y trasera, con daños y residuos de adhesivo.',
    icono: Megaphone,
    acento: 'from-pink-500 to-rose-500',
    tabla: 'publicidad',
    fijo: false,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 80,
  },
  {
    clave: 'mas15',
    nombre: '+15',
    funcion:
      'Determina si el equipo embarcado mantiene alimentación tras cortar la corriente del bus.',
    procedimiento:
      'Encender el bus y esperar a que la consola y el validador se enciendan. Con ambos encendidos, apagar el bus y retirar el corta corriente. Si la consola y el validador siguen encendidos tras retirar el corta corriente, el bus cuenta con +15. Si ambos se apagan, se registra que no cuenta con +15.',
    icono: BatteryCharging,
    acento: 'from-lime-500 to-emerald-500',
    tabla: 'mas15',
    fijo: false,
    // Requiere encender el bus: no tiene sentido en un bus en panne
    obligatorioEnPanne: false,
    requiereBusOperativo: true,
    orden: 90,
  },
  {
    clave: 'cierre',
    nombre: 'Cierre',
    funcion: 'Resumen final, observaciones generales y envío de la revisión.',
    icono: Flag,
    acento: 'from-emerald-500 to-green-500',
    tabla: null,
    fijo: true,
    obligatorioEnPanne: true,
    requiereBusOperativo: false,
    orden: 999,
  },
]

export const MODULOS_POR_CLAVE = new Map(MODULOS.map((modulo) => [modulo.clave, modulo]))

/** Módulos que el supervisor puede encender, apagar o programar */
export const MODULOS_CONFIGURABLES = MODULOS.filter((modulo) => !modulo.fijo)

export const obtenerModulo = (clave: ModuloClave) => MODULOS_POR_CLAVE.get(clave)
