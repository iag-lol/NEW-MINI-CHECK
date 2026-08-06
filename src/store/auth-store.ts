import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { formatRut, validateRut } from '@/lib/rut'
import { limpiarActividad, marcarActividad, sesionCaducada } from '@/lib/sesion'
import type { Role } from '@/types/database'

export interface AuthUser {
  rut: string
  nombre: string
  cargo: Role
  terminal: string
  foto_url?: string | null
}

/** Por qué terminó la última sesión, para explicarlo en el login */
export type MotivoCierre = 'inactividad' | 'manual' | null

interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
  motivoCierre: MotivoCierre
  lastVisitedPath: string
  login: (rut: string, password: string) => Promise<void>
  logout: (motivo?: Exclude<MotivoCierre, null>) => Promise<void>
  updateUser: (updates: Partial<AuthUser>) => void
  setLastVisitedPath: (path: string) => void
  limpiarMotivo: () => void
}

/** Respuesta de la función `autenticar_usuario` del servidor */
interface RespuestaAutenticacion {
  ok: boolean
  motivo: 'ok' | 'no_existe' | 'password_incorrecta' | 'bloqueado'
  espera_seg: number | null
  rut: string | null
  nombre: string | null
  cargo: string | null
  terminal: string | null
  foto_url: string | null
}

/**
 * ¿El error es "esa función no existe todavía"?
 *
 * PostgREST devuelve PGRST202 cuando no encuentra la función y PostgreSQL
 * 42883 cuando la firma no coincide. En ambos casos significa que aún no se
 * ha ejecutado sql-scripts/seguridad.sql.
 */
const faltaLaFuncion = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST202' ||
  error?.code === '42883' ||
  (error?.message ?? '').includes('Could not find the function')

/**
 * Verificación en el navegador. Es el camino ANTIGUO y sólo se usa mientras
 * no se haya ejecutado el script de seguridad.
 *
 * Es inseguro por diseño: para comparar la contraseña hay que traerse el hash
 * bcrypt a la máquina del usuario, y cualquiera con la clave anónima puede
 * descargar la tabla completa de hashes y romperlos sin conexión. Se conserva
 * únicamente para que la app no deje de funcionar entre el despliegue del
 * código y la ejecución del SQL.
 *
 * bcryptjs se carga bajo demanda: son ~80 kB que no tienen por qué estar en
 * el arranque de todos los que ya usan la ruta segura.
 */
const loginHeredado = async (
  rutFormateado: string,
  password: string
): Promise<{ user: AuthUser | null; error: string | null }> => {
  console.warn(
    'Autenticando en el navegador (modo heredado). Ejecuta sql-scripts/seguridad.sql ' +
      'para mover la verificación al servidor y dejar de exponer los hashes de contraseña.'
  )

  const { data, error } = await supabase
    .from('usuarios')
    .select('rut, nombre, cargo, terminal, password, foto_url')
    .eq('rut', rutFormateado)
    .maybeSingle()

  if (error) throw error
  if (!data) return { user: null, error: 'RUT no registrado' }

  const { default: bcrypt } = await import('bcryptjs')
  const coincide = await bcrypt.compare(password, data.password)
  if (!coincide) return { user: null, error: 'Contraseña incorrecta' }

  return {
    user: {
      rut: data.rut,
      nombre: data.nombre,
      cargo: data.cargo as Role,
      terminal: data.terminal,
      foto_url: data.foto_url,
    },
    error: null,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,
      motivoCierre: null,
      lastVisitedPath: '/app/formulario',

      login: async (rut: string, password: string) => {
        set({ loading: true, error: null })

        if (!validateRut(rut)) {
          set({ loading: false, error: 'RUT inválido' })
          return
        }
        if (!password) {
          set({ loading: false, error: 'Ingresa tu contraseña' })
          return
        }

        try {
          const rutFormateado = formatRut(rut)

          // Camino seguro: la contraseña se verifica en el servidor y el hash
          // nunca sale de la base de datos.
          const { data, error } = await supabase.rpc('autenticar_usuario', {
            p_rut: rutFormateado,
            p_password: password,
          })

          let usuario: AuthUser | null = null
          let mensaje: string | null = null

          if (error && faltaLaFuncion(error)) {
            const heredado = await loginHeredado(rutFormateado, password)
            usuario = heredado.user
            mensaje = heredado.error
          } else if (error) {
            throw error
          } else {
            const respuesta = (
              Array.isArray(data) ? data[0] : data
            ) as RespuestaAutenticacion | undefined

            if (!respuesta) {
              mensaje = 'No pudimos validar las credenciales'
            } else if (respuesta.ok) {
              usuario = {
                rut: respuesta.rut as string,
                nombre: respuesta.nombre as string,
                cargo: respuesta.cargo as Role,
                terminal: respuesta.terminal as string,
                foto_url: respuesta.foto_url,
              }
            } else if (respuesta.motivo === 'bloqueado') {
              const minutos = Math.ceil((respuesta.espera_seg ?? 0) / 60)
              mensaje = `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} ${
                minutos === 1 ? 'minuto' : 'minutos'
              }.`
            } else {
              // Mismo mensaje para "no existe" y "contraseña incorrecta": decir
              // cuál de los dos falló confirma qué RUT están registrados y
              // convierte el login en un directorio de personal.
              mensaje = 'RUT o contraseña incorrectos'
            }
          }

          if (!usuario) {
            set({ loading: false, error: mensaje ?? 'No pudimos validar las credenciales' })
            return
          }

          marcarActividad(true)
          set({ loading: false, user: usuario, error: null, motivoCierre: null })
        } catch (error) {
          console.error('Error al iniciar sesión', error)
          set({
            loading: false,
            error: 'No pudimos validar las credenciales. Intenta nuevamente.',
          })
        }
      },

      logout: async (motivo: Exclude<MotivoCierre, null> = 'manual') => {
        // Retirar del mapa en vivo. Es el único punto donde se borra la fila:
        // el seguimiento GPS ya no lo hace al desmontarse, porque eso provocaba
        // desconexiones fantasma al guardar el perfil o rehidratar el store.
        const rut = useAuthStore.getState().user?.rut
        if (rut) {
          await supabase
            .from('usuarios_activos')
            .delete()
            .eq('usuario_rut', rut)
            .then(undefined, (error) =>
              console.error('No se pudo retirar al usuario del mapa', error)
            )
        }

        limpiarActividad()
        set({ user: null, lastVisitedPath: '/app/formulario', motivoCierre: motivo })
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setLastVisitedPath: (path: string) => set({ lastVisitedPath: path }),

      limpiarMotivo: () => set({ motivoCierre: null }),
    }),
    {
      name: 'nmcheck-auth',
      version: 2,
      partialize: (state) => ({
        user: state.user,
        lastVisitedPath: state.lastVisitedPath,
      }),
      // Un cambio de `version` sin `migrate` descarta el estado guardado y
      // expulsa a todos los que ya habían iniciado sesión.
      migrate: (estado) => estado as { user: AuthUser | null; lastVisitedPath: string },
      onRehydrateStorage: () => (estado) => {
        // Si la pestaña se cerró hace más del plazo de inactividad, la sesión
        // no debe volver sólo porque el usuario siga en localStorage: ese es
        // exactamente el caso que el cierre automático debe cubrir.
        if (estado?.user && sesionCaducada()) {
          limpiarActividad()
          estado.user = null
          estado.motivoCierre = 'inactividad'
        }
      },
    }
  )
)
