import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { User, Camera, Lock, Palette, Save, Loader2, LogOut } from 'lucide-react'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotificationStore } from '@/store/notification-store'
import { useTheme, TEMAS, type TemaId } from '@/hooks/use-theme'
import type { Tables } from '@/types/database'

type Usuario = Tables<'usuarios'>
type Perfil = Pick<
  Usuario,
  'rut' | 'nombre' | 'cargo' | 'terminal' | 'foto_url' | 'foto_perfil' | 'tema_color'
>

export function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore()
  const { push } = useNotificationStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { temaActual, aplicarTema } = useTheme()

  const [nombre, setNombre] = useState(user?.nombre || '')
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Query para obtener perfil completo
  const { data: perfil } = useQuery({
    queryKey: ['perfil', user?.rut],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('usuarios')
        .select('rut, nombre, cargo, terminal, foto_url, foto_perfil, tema_color')
        .eq('rut', user.rut)
        .single()

      if (error) throw error
      return data as Perfil
    },
    enabled: !!user,
  })

  // Mutation para actualizar perfil
  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Usuario>) => {
      if (!user) throw new Error('Usuario no autenticado')

      const { error } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('rut', user.rut)

      if (error) throw error
    },
    onSuccess: (_, updates) => {
      queryClient.invalidateQueries({ queryKey: ['perfil', user?.rut] })
      updateUser({
        ...(updates.nombre ? { nombre: updates.nombre } : {}),
        ...(updates.foto_url ? { foto_url: updates.foto_url } : {}),
      })
      push({
        id: Date.now().toString(),
        title: 'Perfil actualizado',
        body: 'Tus cambios se han guardado correctamente',
      })
    },
    onError: (error) => {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: `No se pudo actualizar el perfil: ${error}`,
      })
    },
  })

  // Mutation para cambiar contraseña
  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      if (!user) throw new Error('Usuario no autenticado')

      const { data: credentials, error: credentialsError } = await supabase
        .from('usuarios')
        .select('password')
        .eq('rut', user.rut)
        .single()

      if (credentialsError) throw credentialsError

      const currentPasswordMatches = await bcrypt.compare(
        currentPassword,
        credentials.password
      )
      if (!currentPasswordMatches) {
        throw new Error('La contraseña actual no es correcta')
      }

      const passwordHash = await bcrypt.hash(newPassword, 10)
      const { error } = await supabase
        .from('usuarios')
        .update({ password: passwordHash })
        .eq('rut', user.rut)

      if (error) throw error
    },
    onSuccess: () => {
      setPasswordActual('')
      setPasswordNueva('')
      setPasswordConfirm('')
      push({
        id: Date.now().toString(),
        title: 'Contraseña actualizada',
        body: 'Tu contraseña se ha cambiado correctamente',
      })
    },
    onError: (error) => {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: error instanceof Error ? error.message : 'No se pudo cambiar la contraseña',
      })
    },
  })

  const handleGuardarPerfil = () => {
    updateProfileMutation.mutate({
      nombre,
    })
  }

  const handleCambiarTema = (temaId: TemaId) => {
    // Aplicar tema inmediatamente a la UI
    aplicarTema(temaId)

    // Actualizar inmediatamente el cache de React Query para que se refleje sin esperar
    queryClient.setQueryData(['user-theme', user?.rut], temaId)

    // Guardar en la base de datos
    updateProfileMutation.mutate(
      { tema_color: temaId },
      {
        onSuccess: () => {
          // Invalidar las queries relacionadas con el tema
          queryClient.invalidateQueries({ queryKey: ['user-theme', user?.rut] })
          queryClient.invalidateQueries({ queryKey: ['perfil', user?.rut] })

          push({
            id: Date.now().toString(),
            title: 'Tema actualizado',
            body: `Tema "${TEMAS[temaId].nombre}" aplicado correctamente`,
          })
        },
      }
    )
  }

  const handleLogout = () => {
    void logout()
    navigate('/login')
  }

  const handleCambiarPassword = () => {
    if (!passwordActual) {
      push({
        id: Date.now().toString(),
        title: 'Contraseña actual requerida',
        body: 'Ingresa tu contraseña actual para confirmar el cambio',
        type: 'warning',
      })
      return
    }

    if (passwordNueva !== passwordConfirm) {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: 'Las contraseñas no coinciden',
      })
      return
    }

    if (passwordNueva.length < 6) {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: 'La contraseña debe tener al menos 6 caracteres',
      })
      return
    }

    changePasswordMutation.mutate({
      currentPassword: passwordActual,
      newPassword: passwordNueva,
    })
  }

  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: 'Por favor selecciona un archivo de imagen válido',
      })
      return
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: 'La imagen debe ser menor a 5MB',
      })
      return
    }

    setUploadingPhoto(true)
    try {
      // Crear nombre único para el archivo
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.rut}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Subir archivo a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        console.error('Error subiendo foto de perfil:', uploadError)
        throw uploadError
      }

      // Obtener URL pública de la foto
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath)

      console.log('📸 Foto subida exitosamente')
      console.log('📁 FilePath:', filePath)
      console.log('🔗 Public URL:', publicUrl)

      // Actualizar perfil con la nueva URL
      await updateProfileMutation.mutateAsync({
        foto_perfil: publicUrl,
        foto_url: publicUrl,
      })

      console.log('✅ Perfil actualizado en BD con URL:', publicUrl)

      // Actualizar el store de auth
      queryClient.invalidateQueries({ queryKey: ['perfil', user.rut] })

      push({
        id: Date.now().toString(),
        title: 'Foto actualizada',
        body: 'Tu foto de perfil se ha actualizado correctamente',
      })
    } catch (error) {
      console.error('Error uploading photo:', error)
      push({
        id: Date.now().toString(),
        title: 'Error',
        body: 'No se pudo subir la foto. Intenta nuevamente.',
      })
    } finally {
      setUploadingPhoto(false)
      // Limpiar el input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (!user || !perfil) {
    return (
      <div className="glass-panel flex min-h-72 items-center justify-center rounded-[26px]">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          Cargando perfil...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-panel relative overflow-hidden rounded-[26px] p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-brand-400/15 blur-3xl" />
          <p className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Cuenta personal</p>
          <h1 className="relative text-2xl font-extrabold tracking-[-0.04em] text-slate-950 dark:text-white sm:text-3xl">Mi Perfil</h1>
          <p className="relative mt-1 text-sm text-slate-600 dark:text-slate-400">
            Personaliza tu experiencia en New Mini-Check
          </p>
        </div>

        {/* Foto y datos básicos */}
        <Card className="p-5 sm:p-7">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white/70 bg-brand-100 shadow-xl dark:border-white/10 dark:bg-brand-900">
                {uploadingPhoto ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                ) : perfil.foto_perfil ? (
                  <img
                    src={perfil.foto_perfil}
                    alt="Foto de perfil"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      console.error('❌ Error cargando imagen:', perfil.foto_perfil)
                      console.error('Error event:', e)
                      // Mostrar icono por defecto si hay error
                      e.currentTarget.style.display = 'none'
                    }}
                    onLoad={() => {
                      console.log('✅ Imagen cargada correctamente:', perfil.foto_perfil)
                    }}
                  />
                ) : (
                  <User className="h-12 w-12 text-brand-600" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadPhoto}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Cambiar foto de perfil"
                className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow-lg hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-900"
                title="Cambiar foto de perfil"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-extrabold tracking-[-0.03em] text-slate-950 dark:text-white">{perfil.nombre}</h2>
              <p className="text-slate-600 dark:text-slate-400">
                {perfil.cargo} · {perfil.terminal}
              </p>
              <p className="text-sm text-slate-500">RUT: {perfil.rut}</p>
            </div>
          </div>

          <div className="mt-7 space-y-4 border-t border-white/60 pt-6 dark:border-white/[0.06]">
            <div>
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button
              onClick={handleGuardarPerfil}
              disabled={updateProfileMutation.isPending}
              className="w-full gap-2 sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar Nombre'}
            </Button>
          </div>
        </Card>

        {/* Cambiar contraseña */}
        <Card className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <Lock className="h-6 w-6 text-brand-500" />
            <h3 className="text-xl font-bold">Cambiar Contraseña</h3>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="password-actual">Contraseña Actual</Label>
              <Input
                id="password-actual"
                type="password"
                autoComplete="current-password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password-nueva">Nueva Contraseña</Label>
              <Input
                id="password-nueva"
                type="password"
                autoComplete="new-password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password-confirm">Confirmar Nueva Contraseña</Label>
              <Input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button
              onClick={handleCambiarPassword}
              disabled={changePasswordMutation.isPending}
              variant="outline"
              className="w-full gap-2 sm:w-auto"
            >
              <Lock className="h-4 w-4" />
              {changePasswordMutation.isPending ? 'Cambiando...' : 'Cambiar Contraseña'}
            </Button>
          </div>
        </Card>

        {/* Temas de color */}
        <Card className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <Palette className="h-6 w-6 text-brand-500" />
            <h3 className="text-xl font-bold">Tema de Color</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(TEMAS).map(([id, tema]) => (
              <button
                key={id}
                type="button"
                onClick={() => handleCambiarTema(id as TemaId)}
                aria-pressed={temaActual === id}
                className={`rounded-[20px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  temaActual === id
                    ? 'border-brand-500 bg-brand-50/45 shadow-lg ring-2 ring-brand-500/10 dark:bg-brand-500/10'
                    : 'border-white/70 bg-white/35 hover:border-brand-300 dark:border-white/[0.07] dark:bg-white/[0.025]'
                }`}
              >
                <div className="mb-3 space-y-2">
                  {/* Fondo del tema */}
                  <div
                    className="h-12 w-full rounded-xl border border-slate-200 shadow-sm"
                    style={{ backgroundColor: tema.colors.bg }}
                  />
                  {/* Colores de acento */}
                  <div className="flex gap-2">
                    <div
                      className="h-8 flex-1 rounded-md shadow-sm"
                      style={{ backgroundColor: tema.colors.primary }}
                    />
                    <div
                      className="h-8 flex-1 rounded-md shadow-sm"
                      style={{ backgroundColor: tema.colors.primaryLight }}
                    />
                  </div>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{tema.nombre}</p>
                {temaActual === id && (
                  <p className="text-sm text-brand-600 font-medium">✓ Tema activo</p>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* Botón de cerrar sesión (solo visible en móvil) */}
        <div className="block md:hidden">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            <LogOut className="h-5 w-5" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </div>
  )
}
