import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  X,
  Check,
  CheckCheck,
  Users,
  Loader2,
  Smile,
  Paperclip,
} from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { ChatToastContainer, type ChatToast } from '@/components/chat-toast'
import { useNotificationStore } from '@/store/notification-store'

dayjs.extend(relativeTime)
dayjs.locale('es')

interface Mensaje {
  id: string
  created_at: string
  usuario_rut: string
  usuario_nombre: string
  usuario_cargo: string
  usuario_foto: string | null
  mensaje: string
  imagen_url: string | null
  menciones: string[]
  leido_por: string[]
  editado: boolean
  editado_en: string | null
  deleted: boolean
}

interface Usuario {
  rut: string
  nombre: string
  cargo: string
  foto_perfil: string | null
}

export function ChatPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const notificationStore = useNotificationStore()

  const [mensaje, setMensaje] = useState('')
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [mostrarMenciones, setMostrarMenciones] = useState(false)
  const [mencionQuery, setMencionQuery] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [toasts, setToasts] = useState<ChatToast[]>([])

  const mensajesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Query para obtener mensajes
  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['mensajes-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensajes')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error
      // Supabase limita primero los mensajes más recientes; la UI los muestra cronológicamente.
      return (data as Mensaje[]).reverse()
    },
    refetchInterval: false,
  })

  // Query para obtener usuarios (para @menciones)
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('rut, nombre, cargo, foto_perfil')
        .order('nombre')

      if (error) throw error
      return data as Usuario[]
    },
  })

  // Filtrar usuarios para autocompletado
  const usuariosFiltrados = useMemo(() => {
    if (!mencionQuery) return usuarios
    const query = mencionQuery.toLowerCase()
    return usuarios.filter(u =>
      u.nombre.toLowerCase().includes(query) ||
      u.rut.includes(query)
    )
  }, [mencionQuery, usuarios])

  // Marcar mensajes como leídos
  const { mutate: marcarComoLeido } = useMutation({
    mutationFn: async (mensajeId: string) => {
      if (!user) return

      // Obtener el mensaje actual
      const { data: mensaje } = await supabase
        .from('mensajes')
        .select('leido_por')
        .eq('id', mensajeId)
        .single()

      if (!mensaje) return

      // Agregar el usuario a leido_por si no está ya
      if (!mensaje.leido_por.includes(user.rut)) {
        const { error } = await supabase
          .from('mensajes')
          .update({ leido_por: [...mensaje.leido_por, user.rut] })
          .eq('id', mensajeId)

        if (error) throw error
      }
    },
  })

  // Agregar toast
  const addToast = (toast: ChatToast) => {
    setToasts(prev => [...prev, toast])
  }

  // Remover toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Suscripción en tiempo real a nuevos mensajes
  useEffect(() => {
    if (!user) return

    channelRef.current = supabase
      .channel('mensajes-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
        },
        (payload) => {
          const nuevoMensaje = payload.new as Mensaje

          // Agregar mensaje al cache
          queryClient.setQueryData(['mensajes-chat'], (old: Mensaje[] = []) => [...old, nuevoMensaje])

          // Si no es mi mensaje, notificar
          if (nuevoMensaje.usuario_rut !== user.rut) {
            // Verificar si fui mencionado
            const fuiMencionado = nuevoMensaje.menciones.includes(user.rut)

            // Toast flotante
            addToast({
              id: nuevoMensaje.id,
              nombre: nuevoMensaje.usuario_nombre,
              mensaje: nuevoMensaje.mensaje || '📷 Imagen',
              foto: nuevoMensaje.usuario_foto,
              cargo: nuevoMensaje.usuario_cargo,
            })

            // Notificación del sistema
            notificationStore.push({
              id: `chat-${nuevoMensaje.id}`,
              title: fuiMencionado
                ? `🔔 ${nuevoMensaje.usuario_nombre} te mencionó`
                : `💬 ${nuevoMensaje.usuario_nombre}`,
              body: nuevoMensaje.mensaje.substring(0, 100) || 'Envió una imagen',
              type: fuiMencionado ? 'warning' : 'info',
              metadata: { mensajeId: nuevoMensaje.id },
            })

            // Marcar como leído después de 2 segundos
            setTimeout(() => {
              marcarComoLeido(nuevoMensaje.id)
            }, 2000)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensajes',
        },
        (payload) => {
          const mensajeActualizado = payload.new as Mensaje

          // Actualizar mensaje en cache
          queryClient.setQueryData(['mensajes-chat'], (old: Mensaje[] = []) =>
            old.map(m => m.id === mensajeActualizado.id ? mensajeActualizado : m)
          )
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user, queryClient, notificationStore, marcarComoLeido])

  // Mutation para enviar mensaje
  const enviarMensajeMutation = useMutation({
    mutationFn: async () => {
      if (!user || (!mensaje.trim() && !imagenFile)) return

      let imagenUrl: string | null = null

      // Subir imagen si existe
      if (imagenFile) {
        const fileName = `${Date.now()}-${imagenFile.name}`
        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(fileName, imagenFile, {
            contentType: imagenFile.type,
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('Error subiendo imagen:', uploadError)
          throw new Error(`Error al subir imagen: ${uploadError.message}`)
        }

        const { data: { publicUrl } } = supabase.storage
          .from('chat-images')
          .getPublicUrl(fileName)

        imagenUrl = publicUrl
      }

      // Extraer menciones del mensaje (buscar @Nombre)
      const mencionesMatch = mensaje.match(/@([A-Za-zÁ-ú\s]+)/g)
      const nombresmencionados = mencionesMatch
        ? mencionesMatch.map(m => m.substring(1).trim())
        : []

      // Convertir nombres a RUTs para guardar en BD
      const menciones = nombresmencionados
        .map(nombre => {
          const usuario = usuarios.find(u => u.nombre === nombre)
          return usuario?.rut
        })
        .filter((rut): rut is string => rut !== undefined)

      // Obtener foto del usuario
      const { data: userData } = await supabase
        .from('usuarios')
        .select('foto_perfil')
        .eq('rut', user.rut)
        .single()

      // Insertar mensaje
      const { error } = await supabase.from('mensajes').insert({
        usuario_rut: user.rut,
        usuario_nombre: user.nombre,
        usuario_cargo: user.cargo,
        usuario_foto: userData?.foto_perfil || null,
        mensaje: mensaje.trim(),
        imagen_url: imagenUrl,
        menciones,
        leido_por: [user.rut], // El autor ya lo leyó
      })

      if (error) throw error
    },
    onSuccess: () => {
      setMensaje('')
      setImagenPreview(null)
      setImagenFile(null)
      queryClient.invalidateQueries({ queryKey: ['mensajes-chat'] })

      // Scroll al final
      setTimeout(() => {
        mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    },
  })

  // Scroll automático al final cuando hay nuevos mensajes
  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes.length])

  // Detectar @ para mostrar menciones
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const textoAntesDelCursor = mensaje.substring(0, cursorPosition)
    const ultimoArroba = textoAntesDelCursor.lastIndexOf('@')

    if (ultimoArroba !== -1 && ultimoArroba === textoAntesDelCursor.length - 1) {
      // Justo después de escribir @
      setMostrarMenciones(true)
      setMencionQuery('')
    } else if (ultimoArroba !== -1) {
      // Después de @ con texto
      const textoDesdeArroba = textoAntesDelCursor.substring(ultimoArroba + 1)
      if (/^[a-zA-Z0-9]*$/.test(textoDesdeArroba)) {
        setMostrarMenciones(true)
        setMencionQuery(textoDesdeArroba)
      } else {
        setMostrarMenciones(false)
      }
    } else {
      setMostrarMenciones(false)
    }
  }, [mensaje, cursorPosition])

  // Manejar selección de mención
  const seleccionarMencion = (usuario: Usuario) => {
    const textoAntesDelCursor = mensaje.substring(0, cursorPosition)
    const ultimoArroba = textoAntesDelCursor.lastIndexOf('@')

    const nuevoMensaje =
      mensaje.substring(0, ultimoArroba) +
      `@${usuario.nombre} ` +
      mensaje.substring(cursorPosition)

    setMensaje(nuevoMensaje)
    setMostrarMenciones(false)
    setMencionQuery('')

    // Enfocar textarea
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPosition = ultimoArroba + usuario.nombre.length + 2
      textareaRef.current?.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  // Manejar cambio de imagen
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen no puede superar los 10MB')
      return
    }

    setImagenFile(file)

    const reader = new FileReader()
    reader.onloadend = () => {
      setImagenPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  // Manejar envío con Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!mostrarMenciones) {
        enviarMensajeMutation.mutate()
      }
    }
  }

  // Agrupar mensajes por fecha
  const mensajesAgrupados = useMemo(() => {
    const grupos: { [fecha: string]: Mensaje[] } = {}

    mensajes.forEach(msg => {
      const fecha = dayjs(msg.created_at).format('YYYY-MM-DD')
      if (!grupos[fecha]) {
        grupos[fecha] = []
      }
      grupos[fecha].push(msg)
    })

    return grupos
  }, [mensajes])

  // Formatear fecha para separador
  const formatearFechaSeparador = (fecha: string) => {
    const hoy = dayjs().format('YYYY-MM-DD')
    const ayer = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

    if (fecha === hoy) return 'Hoy'
    if (fecha === ayer) return 'Ayer'
    return dayjs(fecha).format('DD [de] MMMM [de] YYYY')
  }

  // Renderizar mensaje con menciones resaltadas
  const renderMensajeConMenciones = (texto: string, menciones: string[]) => {
    if (menciones.length === 0) return texto

    const mentionNames = menciones
      .map((rut) => usuarios.find((usuario) => usuario.rut === rut)?.nombre)
      .filter((name): name is string => Boolean(name))

    if (mentionNames.length === 0) return texto

    const escapedNames = mentionNames.map((name) =>
      name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    const matcher = new RegExp(`(@(?:${escapedNames.join('|')}))`, 'g')
    const names = new Set(mentionNames.map((name) => `@${name}`))

    return texto.split(matcher).map((part, index) =>
      names.has(part) ? (
        <span key={`${part}-${index}`} className="font-semibold underline decoration-current/25 underline-offset-2">
          {part}
        </span>
      ) : (
        part
      )
    )
  }

  if (!user) {
    return (
      <div className="flex h-[calc(100dvh-12rem)] items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">Debes iniciar sesión para usar el chat</p>
      </div>
    )
  }

  return (
    <>
      {/* Toasts flotantes */}
      <ChatToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Contenedor principal del chat - ajustado al layout */}
      <div className="glass-panel flex h-[calc(100dvh-12.75rem)] min-h-[32rem] flex-col overflow-hidden rounded-[26px] md:h-[calc(100dvh-8rem)]">
        {/* Header */}
        <div className="relative flex items-center justify-between overflow-hidden border-b border-white/15 bg-gradient-to-r from-brand-500 to-violet-600 px-4 py-3.5 sm:px-6 sm:py-4">
          <div aria-hidden="true" className="absolute -right-8 -top-16 h-32 w-32 rounded-full bg-white/15 blur-3xl" />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/20 bg-white/15 backdrop-blur-sm sm:h-12 sm:w-12 sm:rounded-2xl">
              <Users className="h-5 w-5 text-white sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-[-0.03em] text-white sm:text-xl">
                Chat General
              </h1>
              <p className="text-xs text-white/75 sm:text-sm">
                {usuarios.length} miembros del equipo
              </p>
            </div>
          </div>
          <div className="relative hidden items-center gap-2 md:flex">
            <div className="flex h-2 w-2 animate-pulse rounded-full bg-green-400"></div>
            <span className="text-sm text-white/90">Conectado</span>
          </div>
        </div>

        {/* Mensajes - área con scroll */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-500" />
                <p className="mt-3 text-sm text-slate-500">Cargando mensajes...</p>
              </div>
            </div>
          ) : mensajes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/30">
                  <Smile className="h-10 w-10 text-brand-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  ¡Sé el primero en escribir!
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Inicia la conversación con tu equipo
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-6">
              {Object.entries(mensajesAgrupados).map(([fecha, mensajesDia]) => (
                <div key={fecha}>
                  {/* Separador de fecha */}
                  <div className="mb-6 flex items-center justify-center">
                    <div className="rounded-full bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                      {formatearFechaSeparador(fecha)}
                    </div>
                  </div>

                  {/* Mensajes del día */}
                  <AnimatePresence mode="popLayout">
                    {mensajesDia.map((msg) => {
                      const esMio = msg.usuario_rut === user.rut
                      const fueLeido = msg.leido_por.length > 1
                      const fuiMencionado = msg.menciones.includes(user.rut)

                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                          className={`mb-4 flex ${esMio ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`flex max-w-[88%] gap-2 sm:max-w-[78%] sm:gap-3 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Avatar */}
                            {!esMio && (
                              <div className="flex-shrink-0">
                                {msg.usuario_foto ? (
                                  <img
                                    src={msg.usuario_foto}
                                    alt={msg.usuario_nombre}
                                    className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white ring-2 ring-slate-200 dark:ring-slate-700">
                                    {msg.usuario_nombre.charAt(0)}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Burbuja de mensaje */}
                            <div>
                              {!esMio && (
                                <div className="mb-1.5 flex items-center gap-2 px-1">
                                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {msg.usuario_nombre}
                                  </p>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    {msg.usuario_cargo}
                                  </span>
                                </div>
                              )}

                              <div
                                className={`rounded-2xl px-4 py-3 shadow-md ${
                                  esMio
                                    ? fuiMencionado
                                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white'
                                      : 'bg-gradient-to-br from-brand-500 to-brand-600 text-white'
                                    : fuiMencionado
                                    ? 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 ring-2 ring-amber-200 dark:from-amber-900 dark:to-amber-800 dark:text-amber-100 dark:ring-amber-700'
                                    : 'bg-white/68 text-slate-900 ring-1 ring-white/70 backdrop-blur-lg dark:bg-white/[0.08] dark:text-slate-100 dark:ring-white/10'
                                }`}
                              >
                                {/* Imagen si existe */}
                                {msg.imagen_url && (
                                  <img
                                    src={msg.imagen_url}
                                    alt="Imagen adjunta"
                                    className="mb-2 max-h-80 rounded-xl"
                                  />
                                )}

                                {/* Texto */}
                                {msg.mensaje && (
                                  <p className="break-words text-sm leading-relaxed">
                                    {renderMensajeConMenciones(msg.mensaje, msg.menciones)}
                                  </p>
                                )}

                                {/* Hora y estado */}
                                <div className="mt-2 flex items-center justify-end gap-1.5 text-xs opacity-75">
                                  <span>{dayjs(msg.created_at).format('HH:mm')}</span>
                                  {esMio && (
                                    <>
                                      {fueLeido ? (
                                        <CheckCheck className="h-3.5 w-3.5" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5" />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              ))}
              <div ref={mensajesEndRef} />
            </div>
          )}
        </div>

        {/* Input de mensaje */}
        <div className="border-t border-white/60 bg-white/28 p-3 backdrop-blur-xl dark:border-white/[0.06] dark:bg-white/[0.025] sm:p-4 md:p-5">
          <div className="mx-auto max-w-5xl">
            {/* Preview de imagen */}
            <AnimatePresence>
              {imagenPreview && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="mb-3 relative inline-block"
                >
                  <img
                    src={imagenPreview}
                    alt="Preview"
                    className="max-h-40 rounded-xl shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImagenPreview(null)
                      setImagenFile(null)
                    }}
                    className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1.5 text-white shadow-lg hover:bg-red-600"
                    aria-label="Quitar imagen adjunta"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Menciones dropdown */}
            <AnimatePresence>
              {mostrarMenciones && usuariosFiltrados.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="glass-panel-strong mb-3 max-h-60 overflow-y-auto rounded-2xl"
                >
                  {usuariosFiltrados.slice(0, 5).map((usuario) => (
                    <button
                      key={usuario.rut}
                      type="button"
                      onClick={() => seleccionarMencion(usuario)}
                      className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50 dark:hover:bg-brand-900/20"
                    >
                      {usuario.foto_perfil ? (
                        <img
                          src={usuario.foto_perfil}
                          alt={usuario.nombre}
                          className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-200"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                          {usuario.nombre.charAt(0)}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {usuario.nombre}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {usuario.cargo}
                        </p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end gap-2">
              {/* Botón de imagen */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adjuntar una imagen"
                className="glass-control flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-slate-600 shadow-sm transition-all hover:text-brand-600 hover:shadow-lg dark:text-slate-300"
                title="Adjuntar imagen"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

              {/* Textarea */}
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  value={mensaje}
                  onChange={(e) => {
                    setMensaje(e.target.value)
                    setCursorPosition(e.target.selectionStart)
                  }}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => setCursorPosition(e.currentTarget.selectionStart)}
                  placeholder="Escribe un mensaje... (usa @ para mencionar)"
                  rows={1}
                  aria-label="Mensaje"
                  className="glass-control w-full resize-none rounded-xl border px-4 py-3 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:text-slate-100 dark:placeholder:text-slate-500"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
              </div>

              {/* Botón enviar */}
              <button
                type="button"
                onClick={() => enviarMensajeMutation.mutate()}
                disabled={enviarMensajeMutation.isPending || (!mensaje.trim() && !imagenFile)}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg transition-all hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-lg"
                title="Enviar mensaje"
                aria-label="Enviar mensaje"
              >
                {enviarMensajeMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>

            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-800">Enter</kbd> para enviar •
              <kbd className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-800">Shift+Enter</kbd> para nueva línea
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
