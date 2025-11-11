import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Image as ImageIcon,
  X,
  Check,
  CheckCheck,
  Users,
  Loader2,
} from 'lucide-react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/es'
import type { RealtimeChannel } from '@supabase/supabase-js'

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

// Sonido de notificación
const playNotificationSound = () => {
  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSBQNY6zn77BZGQg+ltryxHEoBSuAzfLaizsIGGS57OihUBELTKXh8bllHAU2jtjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LZjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMT6fi8LdjHQU2jtjxyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LZjHAU3kdjyyHAmBSh+y/HajT4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmW56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8LdjHAU3kdjyyHAmBSh+y/HajD4JFmS56+mjUxEMUKjj8A==')
  audio.volume = 0.5
  audio.play().catch(() => {})
}

// Solicitar permiso de notificaciones
const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

// Mostrar notificación del navegador
const showBrowserNotification = (titulo: string, mensaje: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(titulo, {
      body: mensaje,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'chat-notification',
      requireInteraction: false,
    })
  }
}

export function ChatPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [mensaje, setMensaje] = useState('')
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenFile, setImagenFile] = useState<File | null>(null)
  const [mostrarMenciones, setMostrarMenciones] = useState(false)
  const [mencionQuery, setMencionQuery] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const mensajesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Solicitar permiso de notificaciones al cargar
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Query para obtener mensajes
  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['mensajes-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensajes')
        .select('*')
        .eq('deleted', false)
        .order('created_at', { ascending: true })
        .limit(500)

      if (error) throw error
      return data as Mensaje[]
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

            if (fuiMencionado) {
              playNotificationSound()
              showBrowserNotification(
                `${nuevoMensaje.usuario_nombre} te mencionó`,
                nuevoMensaje.mensaje.substring(0, 100)
              )
            } else {
              // Sonido más suave para mensajes generales
              playNotificationSound()
            }

            // Marcar como leído después de 2 segundos
            setTimeout(() => {
              marcarComoLeidoMutation.mutate(nuevoMensaje.id)
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
  }, [user, queryClient])

  // Marcar mensajes como leídos
  const marcarComoLeidoMutation = useMutation({
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
          .upload(fileName, imagenFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('chat-images')
          .getPublicUrl(fileName)

        imagenUrl = publicUrl
      }

      // Extraer menciones del mensaje
      const mencionesMatch = mensaje.match(/@(\d{7,9})/g)
      const menciones = mencionesMatch
        ? mencionesMatch.map(m => m.substring(1))
        : []

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
      `@${usuario.rut} ` +
      mensaje.substring(cursorPosition)

    setMensaje(nuevoMensaje)
    setMostrarMenciones(false)
    setMencionQuery('')

    // Enfocar textarea
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPosition = ultimoArroba + usuario.rut.length + 2
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

    let resultado = texto
    menciones.forEach(rut => {
      const usuario = usuarios.find(u => u.rut === rut)
      if (usuario) {
        resultado = resultado.replace(
          new RegExp(`@${rut}`, 'g'),
          `<span class="font-semibold text-brand-600 dark:text-brand-400">@${usuario.nombre}</span>`
        )
      }
    })

    return <span dangerouslySetInnerHTML={{ __html: resultado }} />
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Debes iniciar sesión para usar el chat</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Chat General
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {usuarios.length} usuarios disponibles
            </p>
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            {Object.entries(mensajesAgrupados).map(([fecha, mensajesDia]) => (
              <div key={fecha}>
                {/* Separador de fecha */}
                <div className="mb-4 flex items-center justify-center">
                  <div className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {formatearFechaSeparador(fecha)}
                  </div>
                </div>

                {/* Mensajes del día */}
                <AnimatePresence mode="popLayout">
                  {mensajesDia.map((msg) => {
                    const esMio = msg.usuario_rut === user.rut
                    const fueLeido = msg.leido_por.length > 1 // Más de solo el autor
                    const fuiMencionado = msg.menciones.includes(user.rut)

                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={`mb-3 flex ${esMio ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex max-w-[85%] gap-2 ${esMio ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Avatar */}
                          {!esMio && (
                            <div className="flex-shrink-0">
                              {msg.usuario_foto ? (
                                <img
                                  src={msg.usuario_foto}
                                  alt={msg.usuario_nombre}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-medium text-white">
                                  {msg.usuario_nombre.charAt(0)}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Burbuja de mensaje */}
                          <div>
                            {!esMio && (
                              <p className="mb-1 px-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                                {msg.usuario_nombre}
                                <span className="ml-1 text-slate-400">
                                  ({msg.usuario_cargo})
                                </span>
                              </p>
                            )}

                            <div
                              className={`rounded-2xl px-4 py-2 ${
                                esMio
                                  ? fuiMencionado
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-brand-500 text-white'
                                  : fuiMencionado
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
                                  : 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                              }`}
                            >
                              {/* Imagen si existe */}
                              {msg.imagen_url && (
                                <img
                                  src={msg.imagen_url}
                                  alt="Imagen adjunta"
                                  className="mb-2 max-h-64 rounded-lg"
                                />
                              )}

                              {/* Texto */}
                              {msg.mensaje && (
                                <p className="break-words text-sm">
                                  {renderMensajeConMenciones(msg.mensaje, msg.menciones)}
                                </p>
                              )}

                              {/* Hora y estado */}
                              <div className="mt-1 flex items-center justify-end gap-1 text-xs opacity-70">
                                <span>{dayjs(msg.created_at).format('HH:mm')}</span>
                                {esMio && (
                                  <>
                                    {fueLeido ? (
                                      <CheckCheck className="h-3 w-3" />
                                    ) : (
                                      <Check className="h-3 w-3" />
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
      <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-4xl">
          {/* Preview de imagen */}
          {imagenPreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagenPreview}
                alt="Preview"
                className="max-h-32 rounded-lg"
              />
              <button
                onClick={() => {
                  setImagenPreview(null)
                  setImagenFile(null)
                }}
                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Menciones dropdown */}
          {mostrarMenciones && usuariosFiltrados.length > 0 && (
            <div className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {usuariosFiltrados.slice(0, 5).map((usuario) => (
                <button
                  key={usuario.rut}
                  onClick={() => seleccionarMencion(usuario)}
                  className="flex w-full items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {usuario.foto_perfil ? (
                    <img
                      src={usuario.foto_perfil}
                      alt={usuario.nombre}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-medium text-white">
                      {usuario.nombre.charAt(0)}
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {usuario.nombre}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {usuario.cargo}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Botón de imagen */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />

            {/* Textarea */}
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
              className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />

            {/* Botón enviar */}
            <button
              onClick={() => enviarMensajeMutation.mutate()}
              disabled={enviarMensajeMutation.isPending || (!mensaje.trim() && !imagenFile)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {enviarMensajeMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Presiona Enter para enviar, Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </div>
  )
}
