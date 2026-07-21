import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ============================================================
// Presencia en tiempo real de inspecciones en curso.
// El formulario "anuncia" qué bus está revisando vía Supabase
// Realtime Presence: el aviso desaparece automáticamente cuando
// el inspector termina, cambia de bus o pierde la conexión.
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

/**
 * Anuncia que el usuario está revisando un bus.
 * Se usa en el formulario de inspección: mientras haya un bus
 * seleccionado, el resto de la app ve la alerta en vivo.
 */
export const useAnunciarInspeccion = (
  bus: { ppu: string; numero_interno: string; terminal: string } | null,
  user: { rut: string; nombre: string } | null
) => {
  useEffect(() => {
    if (!bus || !user) return

    const payload: InspeccionEnCurso = {
      rut: user.rut,
      nombre: user.nombre,
      ppu: bus.ppu,
      interno: bus.numero_interno,
      terminal: bus.terminal,
      startedAt: new Date().toISOString(),
    }

    const channel = supabase.channel(CHANNEL_TOPIC, {
      config: { presence: { key: user.rut } },
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(payload)
      }
    })

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [bus?.ppu, user?.rut]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Escucha en vivo todas las inspecciones en curso.
 * Se usa en el header para mostrar las alertas.
 */
export const useInspeccionesEnCurso = (): InspeccionEnCurso[] => {
  const [items, setItems] = useState<InspeccionEnCurso[]>([])

  useEffect(() => {
    const channel = supabase.channel(CHANNEL_TOPIC, {
      config: { presence: { key: `observer-${Math.random().toString(36).slice(2)}` } },
    })

    const sync = () => {
      const state = channel.presenceState<InspeccionEnCurso>()
      const list = Object.values(state)
        .flat()
        .filter((meta) => typeof meta.ppu === 'string' && meta.ppu.length > 0)
        .map((meta) => ({
          rut: meta.rut,
          nombre: meta.nombre,
          ppu: meta.ppu,
          interno: meta.interno,
          terminal: meta.terminal,
          startedAt: meta.startedAt,
        }))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      setItems(list)
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return items
}
