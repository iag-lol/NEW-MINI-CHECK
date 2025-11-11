import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import bcrypt from 'bcryptjs'
import { UserPlus, Users, ShieldCheck, Phone, Mail, RefreshCw, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TERMINAL_GEOFENCES, type TerminalSlug } from '@/constants/geofences'
import { formatRut, validateRut } from '@/lib/rut'
import dayjs from '@/lib/dayjs'
import type { Role, Tables } from '@/types/database'

const cargoOptions: Role[] = ['INSPECTOR', 'SUPERVISOR']
const terminalOptions: TerminalSlug[] = TERMINAL_GEOFENCES.map((terminal) => terminal.name)

export const PersonalPage = () => {
  const [form, setForm] = useState<{
    nombre: string
    rut: string
    cargo: Role
    terminal: TerminalSlug
    telefono: string
    correo: string
    password: string
  }>({
    nombre: '',
    rut: '',
    cargo: 'INSPECTOR' as Role,
    terminal: terminalOptions[0] ?? 'El Roble',
    telefono: '',
    correo: '',
    password: '',
  })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const {
    data: usuarios,
    refetch: refetchUsuarios,
    isLoading: loadingUsuarios,
  } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('rut, nombre, cargo, terminal, created_at, foto_url')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Tables<'usuarios'>[]
    },
    refetchInterval: 30_000,
  })

  const { data: personal, refetch: refetchPersonal } = useQuery({
    queryKey: ['personal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('personal').select('*').order('created_at', {
        ascending: false,
      })
      if (error) throw error
      return data as Tables<'personal'>[]
    },
  })

  const stats = useMemo(() => {
    const total = usuarios?.length ?? 0
    const supervisores = usuarios?.filter((user) => user.cargo === 'SUPERVISOR').length ?? 0
    const inspectores = total - supervisores
    const terminales = new Set(usuarios?.map((user) => user.terminal))
    return { total, supervisores, inspectores, terminales: terminales.size }
  }, [usuarios])

  const resetFeedback = () => setFeedback(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetFeedback()

    if (!validateRut(form.rut)) {
      setFeedback({ type: 'error', message: 'El RUT ingresado no es válido.' })
      return
    }
    if (form.password.length < 6) {
      setFeedback({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    setSaving(true)
    try {
      const formattedRut = formatRut(form.rut)
      const hashedPassword = await bcrypt.hash(form.password, 10)

      const { error: userError } = await supabase.from('usuarios').insert({
        rut: formattedRut,
        nombre: form.nombre.trim(),
        cargo: form.cargo,
        terminal: form.terminal,
        password: hashedPassword,
        foto_url: null,
      })
      if (userError) throw userError

      if (form.telefono || form.correo) {
        await supabase.from('personal').insert({
          nombre: form.nombre.trim(),
          cargo: form.cargo,
          terminal: form.terminal,
          telefono: form.telefono || null,
          correo: form.correo || null,
          estado: 'DISPONIBLE',
        })
      }

      setFeedback({ type: 'success', message: 'Nuevo acceso creado correctamente.' })
      setForm({
        nombre: '',
        rut: '',
        cargo: form.cargo,
        terminal: form.terminal,
        telefono: '',
        correo: '',
        password: '',
      })
      await Promise.all([refetchUsuarios(), refetchPersonal()])
    } catch (error: any) {
      console.error('Error creando usuario', error)
      setFeedback({
        type: 'error',
        message: error?.message ?? 'No pudimos crear el acceso. Intenta nuevamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async (rut: string) => {
    const nueva = prompt('Ingresa la nueva contraseña para este usuario:')
    if (!nueva || nueva.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    const hashed = await bcrypt.hash(nueva, 10)
    await supabase.from('usuarios').update({ password: hashed }).eq('rut', rut)
    setFeedback({ type: 'success', message: `Contraseña actualizada para ${rut}.` })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Personal habilitado"
          value={stats.total}
          description="Accesos activos"
          icon={Users}
          variant="default"
        />
        <StatCard
          title="Supervisores"
          value={stats.supervisores}
          description="Roles con privilegios"
          icon={ShieldCheck}
          variant="warning"
        />
        <StatCard
          title="Inspectores"
          value={stats.inspectores}
          description="Operativos en terreno"
          icon={UserPlus}
          variant="success"
        />
        <StatCard
          title="Terminales cubiertos"
          value={stats.terminales}
          description="Distribución actual"
          icon={MapPin}
          variant="info"
        />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <CardTitle>Personal con acceso</CardTitle>
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => refetchUsuarios()}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>
        <div className="mt-4 max-h-[360px] overflow-auto">
          <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 whitespace-nowrap">Nombre</th>
                  <th className="pb-2 whitespace-nowrap">RUT</th>
                  <th className="pb-2 whitespace-nowrap">Cargo</th>
                  <th className="pb-2 whitespace-nowrap">Terminal</th>
                  <th className="pb-2 whitespace-nowrap">Alta</th>
                  <th className="pb-2 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60">
                {loadingUsuarios && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Cargando personal...
                    </td>
                  </tr>
                )}
                {!loadingUsuarios && usuarios?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Aún no hay usuarios registrados.
                    </td>
                  </tr>
                )}
                {usuarios?.map((usuario) => (
                  <tr key={usuario.rut} className="text-slate-600 dark:text-slate-300">
                    <td className="py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {usuario.nombre}
                    </td>
                    <td className="py-3 whitespace-nowrap">{usuario.rut}</td>
                    <td className="py-3 whitespace-nowrap">
                      <Badge variant={usuario.cargo === 'SUPERVISOR' ? 'warning' : 'outline'}>
                        {usuario.cargo}
                      </Badge>
                    </td>
                    <td className="py-3 whitespace-nowrap">{usuario.terminal}</td>
                    <td className="py-3 whitespace-nowrap">{dayjs(usuario.created_at).format('DD MMM HH:mm')}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-2xl text-xs"
                        onClick={() => resetPassword(usuario.rut)}
                      >
                        Resetear contraseña
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </Card>

      <Card className="p-6">
        <CardTitle>Registrar nuevo acceso</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Completa la ficha para habilitar a un nuevo colaborador. La contraseña se guarda cifrada.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input
              value={form.nombre}
              onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Ej: Maria Pérez"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>RUT</Label>
            <Input
              value={form.rut}
              onChange={(event) => setForm((prev) => ({ ...prev, rut: event.target.value }))}
              placeholder="12.345.678-9"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Cargo</Label>
            <select
              value={form.cargo}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, cargo: event.target.value as Role }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              {cargoOptions.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Terminal</Label>
            <select
              value={form.terminal}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, terminal: event.target.value as TerminalSlug }))
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              {terminalOptions.map((terminal) => (
                <option key={terminal} value={terminal}>
                  {terminal}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Teléfono (opcional)</Label>
            <Input
              value={form.telefono}
              onChange={(event) => setForm((prev) => ({ ...prev, telefono: event.target.value }))}
              placeholder="+56 9 1234 5678"
            />
          </div>
          <div className="space-y-2">
            <Label>Correo (opcional)</Label>
            <Input
              type="email"
              value={form.correo}
              onChange={(event) => setForm((prev) => ({ ...prev, correo: event.target.value }))}
              placeholder="nombre@empresa.cl"
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Contraseña temporal</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Mínimo 6 caracteres"
              required
            />
          </div>
          {feedback && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm lg:col-span-2 ${
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {feedback.message}
            </div>
          )}
          <div className="lg:col-span-2">
            <Button type="submit" className="w-full rounded-2xl" disabled={saving}>
              {saving ? 'Guardando acceso...' : 'Registrar acceso'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <CardTitle>Contactos y disponibilidad</CardTitle>
        <p className="mt-1 text-sm text-slate-500">
          Referencia rápida del personal registrado en el terminal.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {personal?.map((person) => (
            <div
              key={person.id}
              className="rounded-2xl border border-slate-100/70 p-4 dark:border-slate-900/60"
            >
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{person.nombre}</p>
              <p className="text-sm text-slate-500">
                {person.cargo} · Terminal {person.terminal}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                {person.telefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {person.telefono}
                  </span>
                )}
                {person.correo && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {person.correo}
                  </span>
                )}
              </div>
              <Badge variant="outline" className="mt-3">
                {person.estado}
              </Badge>
            </div>
          ))}
          {personal?.length === 0 && (
            <p className="text-sm text-slate-400">Aún no hay contactos registrados.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
