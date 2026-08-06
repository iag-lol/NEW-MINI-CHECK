import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import {
  Activity,
  Bus,
  Camera,
  Check,
  ChevronRight,
  Flame,
  Gauge,
  Lock,
  LogOut,
  MapPin,
  Medal,
  Palette,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  Loader2,
} from 'lucide-react'
import dayjs from '@/lib/dayjs'
import { supabase } from '@/lib/supabase'
import { cambiarPassword, mensajeCredencial } from '@/lib/credenciales'
import { cn } from '@/lib/utils'
import { prepararAvatar } from '@/lib/image'
import { useAuthStore } from '@/store/auth-store'
import { Card, CardEyebrow, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatCard } from '@/components/ui/stat-card'
import { InstallAppCard } from '@/components/install-app'
import { useNotificationStore } from '@/store/notification-store'
import { useTheme, TEMAS, type TemaId } from '@/hooks/use-theme'
import { useMisEstadisticas, useMiRanking } from '@/features/profile/use-mis-estadisticas'
import type { Tables } from '@/types/database'

type Usuario = Tables<'usuarios'>
type Perfil = Pick<
  Usuario,
  'rut' | 'nombre' | 'cargo' | 'terminal' | 'foto_url' | 'foto_perfil' | 'tema_color'
>

const MAX_FOTO_BYTES = 5 * 1024 * 1024

export function ProfilePage() {
  const { user, logout, updateUser } = useAuthStore()
  const { push } = useNotificationStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { temaActual, aplicarTema } = useTheme()

  const [nombre, setNombre] = useState(user?.nombre ?? '')
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const { data: stats, isLoading: cargandoStats } = useMisEstadisticas(user?.rut)
  const { data: ranking } = useMiRanking(user?.rut)

  const avisar = (
    title: string,
    body: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ) => push({ id: `perfil-${Date.now()}`, title, body, type })

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
    },
    onError: (error) => {
      avisar('No se pudo guardar', String(error), 'error')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string
      newPassword: string
    }) => {
      if (!user) throw new Error('Usuario no autenticado')

      // La verificación ocurre en el servidor: ni el hash actual sale de la
      // base de datos ni el navegador puede escribir la columna `password`.
      const resultado = await cambiarPassword(user.rut, currentPassword, newPassword)
      if (!resultado.ok) throw new Error(mensajeCredencial(resultado.motivo))
    },
    onSuccess: () => {
      setPasswordActual('')
      setPasswordNueva('')
      setPasswordConfirm('')
      avisar('Contraseña actualizada', 'Tu clave se cambió correctamente', 'success')
    },
    onError: (error) => {
      avisar(
        'No se pudo cambiar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente',
        'error'
      )
    },
  })

  const handleGuardarNombre = () => {
    const limpio = nombre.trim()
    if (limpio.length < 3) {
      avisar('Nombre muy corto', 'Escribe al menos 3 caracteres', 'warning')
      return
    }
    updateProfileMutation.mutate(
      { nombre: limpio },
      {
        onSuccess: () =>
          avisar('Perfil actualizado', 'Tu nombre quedó guardado', 'success'),
      }
    )
  }

  const handleCambiarTema = (temaId: TemaId) => {
    aplicarTema(temaId)
    queryClient.setQueryData(['user-theme', user?.rut], temaId)
    updateProfileMutation.mutate(
      { tema_color: temaId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['user-theme', user?.rut] })
          queryClient.invalidateQueries({ queryKey: ['perfil', user?.rut] })
        },
      }
    )
  }

  const handleCambiarPassword = () => {
    if (!passwordActual) {
      avisar('Falta tu clave actual', 'La necesitamos para confirmar el cambio', 'warning')
      return
    }
    if (passwordNueva !== passwordConfirm) {
      avisar('No coinciden', 'La nueva contraseña y su confirmación son distintas', 'warning')
      return
    }
    if (passwordNueva.length < 6) {
      avisar('Muy corta', 'La contraseña debe tener al menos 6 caracteres', 'warning')
      return
    }
    changePasswordMutation.mutate({
      currentPassword: passwordActual,
      newPassword: passwordNueva,
    })
  }

  /**
   * Guarda la foto de perfil.
   *
   * La app inicia sesión con bcrypt contra la tabla `usuarios`, no con Supabase
   * Auth, así que `auth.uid()` es NULL y cualquier política de Storage que pida
   * un usuario autenticado rechaza la subida ("new row violates row-level
   * security policy"). Por eso hay dos caminos: se intenta el bucket y, si el
   * bucket no está disponible o la política lo bloquea, la imagen —ya reducida
   * a ~20 KB— se guarda como data URI en la propia columna del perfil. Así
   * subir la foto funciona sin depender de la configuración del proyecto.
   */
  const handleUploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      avisar('Archivo no válido', 'Selecciona una imagen (JPG, PNG o WebP)', 'warning')
      return
    }
    if (file.size > MAX_FOTO_BYTES) {
      avisar('Imagen muy pesada', 'El máximo permitido son 5 MB', 'warning')
      return
    }

    setUploadingPhoto(true)
    try {
      const avatar = await prepararAvatar(file)
      let urlFinal = avatar.dataUrl
      let viaStorage = false

      try {
        const filePath = `avatars/${user.rut}-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('profile-photos')
          .upload(filePath, avatar.blob, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: true,
          })

        if (uploadError) throw uploadError

        const {
          data: { publicUrl },
        } = supabase.storage.from('profile-photos').getPublicUrl(filePath)
        urlFinal = publicUrl
        viaStorage = true
      } catch (storageError) {
        console.warn(
          'Storage rechazó la subida; se guarda la foto en el perfil.',
          storageError
        )
      }

      await updateProfileMutation.mutateAsync({
        foto_perfil: urlFinal,
        foto_url: urlFinal,
      })

      queryClient.invalidateQueries({ queryKey: ['perfil', user.rut] })
      avisar(
        'Foto actualizada',
        viaStorage
          ? 'Tu nueva foto de perfil ya está visible'
          : `Guardada en tu perfil (${Math.round(avatar.bytes / 1024)} KB)`,
        'success'
      )
    } catch (error) {
      console.error('Error guardando la foto de perfil:', error)
      avisar(
        'No se pudo guardar la foto',
        error instanceof Error ? error.message : 'Inténtalo nuevamente',
        'error'
      )
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const quitarFoto = () => {
    updateProfileMutation.mutate(
      { foto_perfil: null, foto_url: null },
      {
        onSuccess: () => {
          updateUser({ foto_url: null })
          avisar('Foto eliminada', 'Volviste al avatar por defecto', 'info')
        },
      }
    )
  }

  const temasAgrupados = useMemo(() => {
    const grupos = new Map<string, Array<[TemaId, (typeof TEMAS)[TemaId]]>>()
    ;(Object.entries(TEMAS) as Array<[TemaId, (typeof TEMAS)[TemaId]]>).forEach(
      ([id, tema]) => {
        grupos.set(tema.familia, [...(grupos.get(tema.familia) ?? []), [id, tema]])
      }
    )
    return [...grupos.entries()]
  }, [])

  if (!user || !perfil) {
    return (
      <div className="glass-panel flex min-h-60 items-center justify-center rounded-[var(--app-radius-lg)]">
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
          Cargando perfil...
        </div>
      </div>
    )
  }

  const foto = perfil.foto_perfil ?? perfil.foto_url
  const iniciales = perfil.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0))
    .join('')
    .toLocaleUpperCase('es')

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-4 sm:space-y-5">
      {/* Cabecera con identidad y pulso de la semana */}
      <Card className="overflow-hidden !p-0">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-brand-500/18 via-brand-500/5 to-transparent"
          />
          <div className="relative flex items-center gap-3 p-3.5 sm:gap-4 sm:p-5">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] border-2 border-white/80 bg-brand-500/12 shadow-lg dark:border-white/10 sm:h-[4.5rem] sm:w-[4.5rem]">
                {uploadingPhoto ? (
                  <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
                ) : foto ? (
                  <img
                    src={foto}
                    alt={`Foto de ${perfil.nombre}`}
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="text-xl font-black text-brand-600 dark:text-brand-300">
                    {iniciales || <User className="h-7 w-7" />}
                  </span>
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
                className="press-feedback absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow-md disabled:opacity-50 dark:border-slate-900"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <CardEyebrow>Cuenta personal</CardEyebrow>
              <h1 className="truncate text-[17px] font-extrabold leading-tight tracking-[-0.035em] text-slate-950 dark:text-white sm:text-2xl">
                {perfil.nombre}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge variant="default">{perfil.cargo}</Badge>
                <Badge variant="outline">
                  <MapPin className="h-2.5 w-2.5" />
                  {perfil.terminal}
                </Badge>
              </div>
              <p className="mt-1 text-[10.5px] font-semibold text-slate-400">
                RUT {perfil.rut}
              </p>
            </div>
          </div>

          {/* Pulso: tres cifras que responden a "¿cómo voy?" */}
          <div className="relative grid grid-cols-3 divide-x divide-white/50 border-t border-white/50 dark:divide-white/[0.06] dark:border-white/[0.06]">
            <PulsoCelda
              icon={Activity}
              valor={stats?.semana ?? 0}
              etiqueta="esta semana"
              cargando={cargandoStats}
            />
            <PulsoCelda
              icon={Flame}
              valor={stats?.racha ?? 0}
              etiqueta={stats?.racha === 1 ? 'día seguido' : 'días seguidos'}
              cargando={cargandoStats}
              destacado={(stats?.racha ?? 0) >= 3}
            />
            <PulsoCelda
              icon={Medal}
              valor={ranking ? `#${ranking.posicion}` : '—'}
              etiqueta={ranking ? `de ${ranking.total} inspectores` : 'sin ranking'}
              cargando={cargandoStats}
              destacado={ranking?.posicion === 1}
            />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList className="w-full">
          <TabsTrigger value="resumen">
            <Gauge className="h-3.5 w-3.5" />
            Mi avance
          </TabsTrigger>
          <TabsTrigger value="cuenta">
            <User className="h-3.5 w-3.5" />
            Cuenta
          </TabsTrigger>
          <TabsTrigger value="apariencia">
            <Palette className="h-3.5 w-3.5" />
            Apariencia
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------- Avance */}
        <TabsContent value="resumen" className="space-y-3 sm:space-y-4">
          {cargandoStats && !stats ? (
            <Card className="flex min-h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            </Card>
          ) : !stats || stats.total === 0 ? (
            <Card className="flex flex-col items-center gap-2 py-9 text-center">
              <Bus className="h-7 w-7 text-slate-300 dark:text-slate-600" />
              <CardTitle>Aún no registras revisiones</CardTitle>
              <p className="max-w-xs text-[12px] text-slate-500 dark:text-slate-400">
                Cuando envíes tu primera inspección, aquí verás tu avance, tu racha y
                tu posición en el equipo.
              </p>
              <Button
                size="sm"
                className="mt-1"
                onClick={() => navigate('/app/formulario')}
              >
                Iniciar una inspección
              </Button>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <StatCard
                  title="Hoy"
                  value={stats.hoy}
                  icon={Activity}
                  variant={stats.hoy > 0 ? 'success' : 'default'}
                  description="revisiones enviadas"
                />
                <StatCard
                  title="Esta semana"
                  value={stats.semana}
                  icon={TrendingUp}
                  variant="info"
                  trend={
                    stats.variacionSemanal !== null
                      ? {
                          value: stats.variacionSemanal,
                          label: 'vs semana previa',
                        }
                      : undefined
                  }
                  description={
                    stats.variacionSemanal === null
                      ? `${stats.semanaAnterior} la semana previa`
                      : undefined
                  }
                />
                <StatCard
                  title="Este mes"
                  value={stats.mes}
                  icon={Bus}
                  description={`${stats.busesUnicos} buses distintos`}
                />
                <StatCard
                  title="Promedio"
                  value={stats.promedioDiario}
                  icon={Gauge}
                  description="revisiones por día"
                />
              </div>

              {/* Actividad diaria */}
              <Card>
                <div className="mb-2.5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <CardEyebrow>Últimos 14 días</CardEyebrow>
                    <CardTitle>Tu actividad diaria</CardTitle>
                  </div>
                  {stats.mejorDia && (
                    <p className="shrink-0 text-right text-[10.5px] leading-tight text-slate-500 dark:text-slate-400">
                      Mejor día
                      <span className="block text-[13px] font-extrabold tabular-nums text-slate-900 dark:text-white">
                        {stats.mejorDia.cantidad}
                      </span>
                      <span className="block">
                        {dayjs(stats.mejorDia.fecha).format('DD MMM')}
                      </span>
                    </p>
                  )}
                </div>

                <div className="h-[132px] w-full sm:h-[168px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.serie}
                      margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                      barCategoryGap="22%"
                    >
                      <XAxis
                        dataKey="etiqueta"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={14}
                        tick={{ fontSize: 9, fill: 'rgb(148 163 184)' }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        contentStyle={{
                          borderRadius: 12,
                          border: 'none',
                          fontSize: 11,
                          padding: '6px 10px',
                          background: 'rgba(15,23,42,0.92)',
                          color: '#fff',
                          boxShadow: '0 10px 24px -12px rgba(15,23,42,.6)',
                        }}
                        labelStyle={{ color: '#cbd5e1', fontSize: 10 }}
                        formatter={(valor: number) => [`${valor}`, 'Revisiones']}
                      />
                      <Bar dataKey="revisiones" radius={[5, 5, 3, 3]}>
                        {stats.serie.map((dia) => (
                          <Cell
                            key={dia.fecha}
                            // El día en curso se destaca; el resto queda en
                            // un tono suave para que el patrón se lea de un vistazo
                            fill={
                              dia.esHoy
                                ? 'var(--color-brand-500)'
                                : 'color-mix(in srgb, var(--color-brand-500) 32%, transparent)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Ranking semanal */}
              {ranking && (
                <Card>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] text-white shadow-md',
                        ranking.posicion === 1
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600'
                          : ranking.posicion <= 3
                            ? 'bg-gradient-to-br from-slate-400 to-slate-600'
                            : 'bg-gradient-to-br from-brand-500 to-violet-600'
                      )}
                    >
                      <Medal className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardEyebrow>Ranking de la semana</CardEyebrow>
                      <p className="text-[13px] font-bold leading-snug text-slate-900 dark:text-white">
                        {ranking.posicion === 1
                          ? 'Vas primero del equipo'
                          : `Puesto ${ranking.posicion} de ${ranking.total}`}
                        <span className="font-medium text-slate-500 dark:text-slate-400">
                          {' · '}
                          {ranking.revisiones} revisiones
                        </span>
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/70">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-500"
                          style={{
                            width: `${
                              ranking.lider > 0
                                ? Math.max(
                                    4,
                                    Math.round((ranking.revisiones / ranking.lider) * 100)
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                        {ranking.posicion === 1
                          ? 'Mantén el ritmo para conservar el primer lugar.'
                          : `Te separan ${ranking.lider - ranking.revisiones} revisiones del líder.`}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Detalle cualitativo */}
              <Card className="space-y-2.5">
                <div>
                  <CardEyebrow>Calidad de tus revisiones</CardEyebrow>
                  <CardTitle>Cómo vas</CardTitle>
                </div>

                <div className="flex items-center gap-2.5 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.035]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">
                        Buses operativos
                      </p>
                      <p className="text-[13px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {stats.tasaOperativa}%
                      </p>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/70">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                        style={{ width: `${stats.tasaOperativa}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                      {stats.operativos} operativos · {stats.enPanne} en panne
                    </p>
                  </div>
                </div>

                <FilaDato
                  icon={Bus}
                  label="Buses distintos revisados"
                  valor={String(stats.busesUnicos)}
                />
                {stats.terminalPrincipal && (
                  <FilaDato
                    icon={MapPin}
                    label="Terminal donde más trabajas"
                    valor={`${stats.terminalPrincipal.nombre} · ${stats.terminalPrincipal.cantidad}`}
                  />
                )}
                <FilaDato
                  icon={Sparkles}
                  label="Revisiones en los últimos 90 días"
                  valor={String(stats.total)}
                />
                {stats.primeraRevision && (
                  <FilaDato
                    icon={Activity}
                    label="Primera revisión del período"
                    valor={dayjs(stats.primeraRevision).format('DD MMM YYYY')}
                  />
                )}
                {stats.enPanne > 0 && (
                  <div className="flex items-start gap-2 rounded-[var(--app-radius-sm)] border border-amber-300/50 bg-amber-50/60 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                      Detectaste {stats.enPanne}{' '}
                      {stats.enPanne === 1 ? 'bus en panne' : 'buses en panne'} en este
                      período. Ese hallazgo es el que evita salidas a ruta con fallas.
                    </p>
                  </div>
                )}
              </Card>

              <Button
                variant="outline"
                className="w-full gap-2"
                // `mias=1` abre Registros filtrado a esta persona, no al equipo
                onClick={() => navigate('/app/registros?mias=1')}
              >
                Ver todas mis revisiones
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------- Cuenta */}
        <TabsContent value="cuenta" className="space-y-3 sm:space-y-4">
          <Card className="space-y-3">
            <div>
              <CardEyebrow>Datos personales</CardEyebrow>
              <CardTitle>Tu identidad en la app</CardTitle>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre visible</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Nombre y apellido"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleGuardarNombre}
                disabled={updateProfileMutation.isPending}
                className="flex-1 gap-2 sm:flex-none"
              >
                <Save className="h-4 w-4" />
                {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button
                variant="subtle"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                <Camera className="h-4 w-4" />
                Cambiar foto
              </Button>
              {foto && (
                <Button
                  variant="ghost"
                  className="gap-2 text-red-500 hover:bg-red-500/10"
                  onClick={quitarFoto}
                >
                  <Trash2 className="h-4 w-4" />
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
              Puedes usar la foto que quieras: JPG, PNG o WebP, hasta 5 MB.
            </p>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-500" />
              <CardTitle>Cambiar contraseña</CardTitle>
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="password-actual">Contraseña actual</Label>
                <Input
                  id="password-actual"
                  type="password"
                  autoComplete="current-password"
                  value={passwordActual}
                  onChange={(event) => setPasswordActual(event.target.value)}
                />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="password-nueva">Nueva contraseña</Label>
                  <Input
                    id="password-nueva"
                    type="password"
                    autoComplete="new-password"
                    value={passwordNueva}
                    onChange={(event) => setPasswordNueva(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-confirm">Confirmar</Label>
                  <Input
                    id="password-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={handleCambiarPassword}
              disabled={changePasswordMutation.isPending}
              variant="outline"
              className="w-full gap-2 sm:w-auto"
            >
              <Lock className="h-4 w-4" />
              {changePasswordMutation.isPending ? 'Cambiando...' : 'Cambiar contraseña'}
            </Button>
          </Card>

          <Card id="instalar" className="space-y-2.5">
            <div>
              <CardEyebrow>Aplicación</CardEyebrow>
              <CardTitle>Instala Mini-Check en tu dispositivo</CardTitle>
            </div>
            <InstallAppCard />
          </Card>

          <Button
            onClick={() => {
              void logout()
              navigate('/login')
            }}
            variant="outline"
            className="w-full gap-2 border-red-300/60 text-red-600 hover:bg-red-500/10 dark:border-red-500/25 dark:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </TabsContent>

        {/* ------------------------------------------------------ Apariencia */}
        <TabsContent value="apariencia" className="space-y-3 sm:space-y-4">
          {temasAgrupados.map(([familia, temas]) => (
            <Card key={familia} className="space-y-2.5">
              <div>
                <CardEyebrow>{familia}</CardEyebrow>
                <CardTitle>
                  {familia === 'Neutro' ? 'Sin color dominante' : `Acentos en tono ${familia.toLocaleLowerCase('es')}`}
                </CardTitle>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {temas.map(([id, tema]) => {
                  const activo = temaActual === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleCambiarTema(id)}
                      aria-pressed={activo}
                      className={cn(
                        'press-feedback relative overflow-hidden rounded-[var(--app-radius-sm)] border p-2 text-left',
                        activo
                          ? 'border-brand-500 ring-2 ring-brand-500/25'
                          : 'border-white/60 bg-white/35 dark:border-white/[0.07] dark:bg-white/[0.025]'
                      )}
                      style={activo ? { backgroundColor: tema.colors.bg } : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-7 w-7 shrink-0 rounded-[9px] shadow-sm ring-1 ring-black/5"
                          style={{ backgroundColor: tema.colors.primary }}
                        />
                        <span className="flex flex-1 gap-1">
                          <span
                            className="h-7 flex-1 rounded-[9px] ring-1 ring-black/5"
                            style={{ backgroundColor: tema.colors.primaryLight }}
                          />
                          <span
                            className="h-7 w-3 rounded-[9px] ring-1 ring-black/5"
                            style={{ backgroundColor: tema.colors.bg }}
                          />
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-[11.5px] font-bold text-slate-800 dark:text-slate-100">
                        {tema.nombre}
                      </p>
                      {activo && (
                        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-white">
                          <Check className="h-2.5 w-2.5" strokeWidth={4} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface PulsoCeldaProps {
  icon: typeof Activity
  valor: number | string
  etiqueta: string
  cargando?: boolean
  destacado?: boolean
}

const PulsoCelda = ({
  icon: Icon,
  valor,
  etiqueta,
  cargando,
  destacado,
}: PulsoCeldaProps) => (
  <div className="flex flex-col items-center gap-0.5 px-1 py-2.5">
    <Icon
      className={cn(
        'h-3.5 w-3.5',
        destacado ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
      )}
    />
    <p
      className={cn(
        'text-[19px] font-extrabold leading-none tabular-nums',
        destacado ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
      )}
    >
      {cargando ? '–' : valor}
    </p>
    <p className="text-center text-[9.5px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
      {etiqueta}
    </p>
  </div>
)

const FilaDato = ({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Activity
  label: string
  valor: string
}) => (
  <div className="flex items-center gap-2.5 rounded-[var(--app-radius-sm)] border border-white/60 bg-white/40 px-2.5 py-2 dark:border-white/[0.06] dark:bg-white/[0.035]">
    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-600 dark:text-slate-300">
      {label}
    </p>
    <p className="shrink-0 text-[12px] font-extrabold tabular-nums text-slate-900 dark:text-white">
      {valor}
    </p>
  </div>
)
