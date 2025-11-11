import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Camera, Lock, Palette, Save, Loader2 } from 'lucide-react'
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

export function ProfilePage() {
  const { user } = useAuthStore()
  const { push } = useNotificationStore()
  const queryClient = useQueryClient()
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
        .select('*')
        .eq('rut', user.rut)
        .single()

      if (error) throw error
      return data as Usuario
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfil', user?.rut] })
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
    mutationFn: async ({ newPassword }: { newPassword: string }) => {
      if (!user) throw new Error('Usuario no autenticado')

      // Actualizar contraseña directamente
      // Nota: En producción deberías validar la contraseña actual
      const { error } = await supabase
        .from('usuarios')
        .update({ password: newPassword })
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
        body: `No se pudo cambiar la contraseña: ${error}`,
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

    // Guardar en la base de datos
    updateProfileMutation.mutate({ tema_color: temaId })
  }

  const handleCambiarPassword = () => {
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
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) throw uploadError

      // Obtener URL pública de la foto
      const { data: { publicUrl } } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath)

      // Actualizar perfil con la nueva URL
      await updateProfileMutation.mutateAsync({
        foto_perfil: publicUrl,
      })

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
      <div className="flex min-h-screen items-center justify-center">
        <p>Cargando perfil...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Mi Perfil</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Personaliza tu experiencia en New Mini-Check
          </p>
        </div>

        {/* Foto y datos básicos */}
        <Card className="p-8">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900">
                {uploadingPhoto ? (
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                ) : perfil.foto_perfil ? (
                  <img
                    src={perfil.foto_perfil}
                    alt="Foto de perfil"
                    className="h-full w-full object-cover"
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
                className="absolute bottom-0 right-0 rounded-full bg-brand-500 p-2 text-white shadow-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cambiar foto de perfil"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div>
              <h2 className="text-2xl font-bold">{perfil.nombre}</h2>
              <p className="text-slate-600 dark:text-slate-400">
                {perfil.cargo} · {perfil.terminal}
              </p>
              <p className="text-sm text-slate-500">RUT: {perfil.rut}</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
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
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar Nombre'}
            </Button>
          </div>
        </Card>

        {/* Cambiar contraseña */}
        <Card className="p-8">
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
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button
              onClick={handleCambiarPassword}
              disabled={changePasswordMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              {changePasswordMutation.isPending ? 'Cambiando...' : 'Cambiar Contraseña'}
            </Button>
          </div>
        </Card>

        {/* Temas de color */}
        <Card className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <Palette className="h-6 w-6 text-brand-500" />
            <h3 className="text-xl font-bold">Tema de Color</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(TEMAS).map(([id, tema]) => (
              <button
                key={id}
                onClick={() => handleCambiarTema(id as TemaId)}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  temaActual === id
                    ? 'border-brand-500 shadow-lg'
                    : 'border-slate-200 hover:border-brand-300 dark:border-slate-800 hover:shadow-md'
                }`}
              >
                <div className="mb-3 space-y-2">
                  {/* Fondo del tema */}
                  <div
                    className="h-12 w-full rounded-lg shadow-sm border border-slate-200"
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
                <p className="font-semibold">{tema.nombre}</p>
                {temaActual === id && (
                  <p className="text-sm text-brand-600 font-medium">✓ Tema activo</p>
                )}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
