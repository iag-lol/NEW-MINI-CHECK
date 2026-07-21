import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// ============================================================
// Presencia en tiempo real de inspecciones en curso.
//
// IMPORTANTE: supabase-js solo admite UN canal por topic por
// cliente. Si el header (observador) y el formulario (anunciante)
// crean cada uno su canal con el mismo topic, el segundo join
// anula al primero y nada funciona. Por eso este módulo mantiene
// UN ÚNICO canal compartido (singleton) para toda la app.
// ============================================================

const CHANNEL_TOPIC = 'inspecciones-en-curso'

export interface InspeccionEnCurso {
  rut: string
  nombre: string
  ppu: string
  interno: string
  terminal: string
  startedAt: string
}

type Listener = (items: InspeccionEnCurso[]) => void

let channel: RealtimeChannel | null = null
let isSubscribed = false
let pendingTrack: InspeccionEnCurso | null = null
const listeners = new Set<Listener>()

// Clave de presencia única por pestaña del navegador
const clientKey = `client-${Math.random().toString(36).slice(2)}`

const parseState = (): InspeccionEnCurso[] => {
  if (!channel) return []
  const state = channel.presenceState<InspeccionEnCurso>()
  const porRut = new Map<string, InspeccionEnCurso>()
  Object.values(state)
    .flat()
    .filter((meta) => typeof meta.ppu === 'string' && meta.ppu.length > 0)
    .forEach((meta) => {
      const item: InspeccionEnCurso = {
        rut: meta.rut,
        nombre: meta.nombre,
        ppu: meta.ppu,
        interno: meta.interno,
        terminal: meta.terminal,
        startedAt: meta.startedAt,
      }
      const existente = porRut.get(item.rut)
      if (!existente || item.startedAt > existente.startedAt) porRut.set(item.rut, item)
    })
  return [...porRut.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

const notify = () => {
  const items = parseState()
  listeners.forEach((listener) => listener(items))
}

const ensureChannel = (): RealtimeChannel => {
  if (channel) return channel

  channel = supabase.channel(CHANNEL_TOPIC, {
    config: { presence: { key: clientKey } },
  })

  channel.on('presence', { event: 'sync' }, notify)

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      isSubscribed = true
      // Si alguien intentó anunciar antes de que el canal conectara
      // (o el socket se reconectó), re-publicar la presencia pendiente
      if (pendingTrack && channel) {
        await channel.track({ ...pendingTrack })
      }
      notify()
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
      isSubscribed = false
    }
  })

  return channel
}

const trackInspeccion = async (payload: InspeccionEnCurso) => {
  pendingTrack = payload
  const ch = ensureChannel()
  if (isSubscribed) {
    await ch.track({ ...payload })
  }
}

const untrackInspeccion = async () => {
  pendingTrack = null
  if (channel && isSubscribed) {
    await channel.untrack()
  }
}

const subscribeInspecciones = (listener: Listener) => {
  listeners.add(listener)
  ensureChannel()
  listener(parseState())
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Anuncia que el usuario está revisando un bus.
 * Mientras haya un bus seleccionado en el formulario, el resto
 * de la app ve la alerta en vivo; al terminar (o desconectarse)
 * desaparece automáticamente.
 */
export const useAnunciarInspeccion = (
  bus: { ppu: string; numero_interno: string; terminal: string } | null,
  user: { rut: string; nombre: string } | null
) => {
  useEffect(() => {
    if (!bus || !user) return

    trackInspeccion({
      rut: user.rut,
      nombre: user.nombre,
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      startedAt: new Date().toISOString(),
    })

    return () => {
      untrackInspeccion()
    }
  }, [bus?.ppu, user?.rut]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Escucha en vivo todas las inspecciones en curso (para el header y los informes). */
export const useInspeccionesEnCurso = (): InspeccionEnCurso[] => {
  const [items, setItems] = useState<InspeccionEnCurso[]>([])
  useEffect(() => subscribeInspecciones(setItems), [])
  return items
}
