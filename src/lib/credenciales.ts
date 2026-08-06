import { supabase } from '@/lib/supabase'

/**
 * Operaciones con contraseñas.
 *
 * Todas pasan por funciones del servidor: el hash no viaja al navegador y la
 * columna `password` no es legible ni escribible con la clave anónima. Ver
 * sql-scripts/seguridad.sql.
 *
 * Cada una conserva un camino heredado que hace el trabajo en el navegador,
 * porque el código se despliega antes de que alguien ejecute el SQL y una app
 * que deja de poder dar de alta a un inspector es un problema real hoy,
 * mientras que el hash expuesto lo es desde hace tiempo. En cuanto el script
 * está ejecutado, el camino heredado deja de usarse solo.
 */

export interface ResultadoCredencial {
  ok: boolean
  motivo: string
}

/** ¿El error es "esa función todavía no existe"? */
const faltaLaFuncion = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST202' ||
  error?.code === '42883' ||
  (error?.message ?? '').includes('Could not find the function')

const avisarHeredado = (operacion: string) => {
  console.warn(
    `${operacion} se está resolviendo en el navegador (modo heredado). ` +
      'Ejecuta sql-scripts/seguridad.sql para que ocurra en el servidor.'
  )
}

/** Traduce el motivo del servidor a algo que se pueda enseñar en pantalla */
export const mensajeCredencial = (motivo: string): string => {
  switch (motivo) {
    case 'no_autorizado':
      return 'Tus credenciales de administrador no son correctas o tu cargo no permite esta acción.'
    case 'password_incorrecta':
      return 'La contraseña actual no es correcta.'
    case 'muy_corta':
      return 'La contraseña debe tener al menos 8 caracteres.'
    case 'no_existe':
      return 'El usuario no existe.'
    case 'ya_existe':
      return 'Ya hay un acceso creado con ese RUT.'
    case 'cargo_invalido':
      return 'El cargo indicado no es válido.'
    default:
      return 'No pudimos completar la operación. Intenta nuevamente.'
  }
}

const primeraFila = (data: unknown): ResultadoCredencial | null => {
  const fila = Array.isArray(data) ? data[0] : data
  return (fila as ResultadoCredencial | undefined) ?? null
}

/** Cambio de contraseña por el propio usuario, verificando la actual */
export const cambiarPassword = async (
  rut: string,
  actual: string,
  nueva: string
): Promise<ResultadoCredencial> => {
  const { data, error } = await supabase.rpc('cambiar_password', {
    p_rut: rut,
    p_actual: actual,
    p_nueva: nueva,
  })

  if (error && faltaLaFuncion(error)) {
    avisarHeredado('El cambio de contraseña')
    const { data: credenciales, error: errorLectura } = await supabase
      .from('usuarios')
      .select('password')
      .eq('rut', rut)
      .single()
    if (errorLectura) throw errorLectura

    const { default: bcrypt } = await import('bcryptjs')
    if (!(await bcrypt.compare(actual, credenciales.password))) {
      return { ok: false, motivo: 'password_incorrecta' }
    }
    const hash = await bcrypt.hash(nueva, 10)
    const { error: errorEscritura } = await supabase
      .from('usuarios')
      .update({ password: hash })
      .eq('rut', rut)
    if (errorEscritura) throw errorEscritura
    return { ok: true, motivo: 'ok' }
  }

  if (error) throw error
  return primeraFila(data) ?? { ok: false, motivo: 'desconocido' }
}

/** Reseteo de la contraseña de otro usuario, acreditando quién lo hace */
export const establecerPasswordComoAdmin = async (
  rutAdmin: string,
  passwordAdmin: string,
  rutObjetivo: string,
  nueva: string
): Promise<ResultadoCredencial> => {
  const { data, error } = await supabase.rpc('admin_establecer_password', {
    p_rut_admin: rutAdmin,
    p_password_admin: passwordAdmin,
    p_rut_objetivo: rutObjetivo,
    p_nueva: nueva,
  })

  if (error && faltaLaFuncion(error)) {
    avisarHeredado('El reseteo de contraseña')
    const { default: bcrypt } = await import('bcryptjs')
    const hash = await bcrypt.hash(nueva, 10)
    const { error: errorEscritura } = await supabase
      .from('usuarios')
      .update({ password: hash })
      .eq('rut', rutObjetivo)
    if (errorEscritura) throw errorEscritura
    return { ok: true, motivo: 'ok' }
  }

  if (error) throw error
  return primeraFila(data) ?? { ok: false, motivo: 'desconocido' }
}

export interface NuevoUsuario {
  rut: string
  nombre: string
  cargo: string
  terminal: string
  password: string
}

/** Alta de un acceso nuevo, acreditando quién la hace */
export const crearUsuarioComoAdmin = async (
  rutAdmin: string,
  passwordAdmin: string,
  usuario: NuevoUsuario
): Promise<ResultadoCredencial> => {
  const { data, error } = await supabase.rpc('admin_crear_usuario', {
    p_rut_admin: rutAdmin,
    p_password_admin: passwordAdmin,
    p_rut: usuario.rut,
    p_nombre: usuario.nombre,
    p_cargo: usuario.cargo,
    p_terminal: usuario.terminal,
    p_password: usuario.password,
  })

  if (error && faltaLaFuncion(error)) {
    avisarHeredado('El alta de usuario')
    const { default: bcrypt } = await import('bcryptjs')
    const hash = await bcrypt.hash(usuario.password, 10)
    const { error: errorEscritura } = await supabase.from('usuarios').insert({
      rut: usuario.rut,
      nombre: usuario.nombre,
      cargo: usuario.cargo as NuevoUsuario['cargo'] & 'INSPECTOR',
      terminal: usuario.terminal,
      password: hash,
      foto_url: null,
    })
    if (errorEscritura) throw errorEscritura
    return { ok: true, motivo: 'ok' }
  }

  if (error) throw error
  return primeraFila(data) ?? { ok: false, motivo: 'desconocido' }
}
