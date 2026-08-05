/**
 * Tonos de notificación sintetizados con Web Audio.
 *
 * No se usan archivos de audio a propósito: pesan, hay que servirlos y en
 * móvil tardan en decodificar. Un par de osciladores suenan igual de bien y
 * están disponibles al instante.
 */

let ctx: AudioContext | null = null

const getAudioContext = () => {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  return ctx
}

/**
 * iOS y Chrome arrancan el AudioContext en estado "suspended" hasta que hay
 * un gesto del usuario. Se llama una vez tras el login / primer toque.
 */
export const desbloquearAudio = () => {
  const audio = getAudioContext()
  if (audio && audio.state === 'suspended') {
    void audio.resume().catch(() => undefined)
  }
}

interface Nota {
  freq: number
  start: number
  duration: number
  gain?: number
  type?: OscillatorType
}

const reproducir = (notas: Nota[]) => {
  const audio = getAudioContext()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined)

  const now = audio.currentTime

  notas.forEach(({ freq, start, duration, gain = 0.16, type = 'sine' }) => {
    const osc = audio.createOscillator()
    const env = audio.createGain()
    // Un poco de brillo sin llegar a sonar metálico
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 4200

    osc.type = type
    osc.frequency.setValueAtTime(freq, now + start)

    env.gain.setValueAtTime(0.0001, now + start)
    env.gain.exponentialRampToValueAtTime(gain, now + start + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)

    osc.connect(filter)
    filter.connect(env)
    env.connect(audio.destination)
    osc.start(now + start)
    osc.stop(now + start + duration + 0.05)
  })
}

export type TonoNotificacion = 'info' | 'success' | 'warning' | 'error'

/** Campanita de dos notas: el sonido por defecto del sistema. */
export const playNotificationTone = (tipo: TonoNotificacion = 'info') => {
  switch (tipo) {
    case 'success':
      // Tercera mayor ascendente: cierre satisfactorio
      reproducir([
        { freq: 880, start: 0, duration: 0.2 },
        { freq: 1174.66, start: 0.09, duration: 0.34, gain: 0.13 },
      ])
      break
    case 'warning':
      // Dos golpes en la misma nota: llama la atención sin alarmar
      reproducir([
        { freq: 740, start: 0, duration: 0.16, type: 'triangle' },
        { freq: 740, start: 0.18, duration: 0.24, gain: 0.14, type: 'triangle' },
      ])
      break
    case 'error':
      // Intervalo descendente: algo salió mal
      reproducir([
        { freq: 622, start: 0, duration: 0.2, type: 'triangle', gain: 0.18 },
        { freq: 415, start: 0.13, duration: 0.36, type: 'triangle', gain: 0.16 },
      ])
      break
    default:
      reproducir([
        { freq: 987.77, start: 0, duration: 0.18 },
        { freq: 1318.51, start: 0.08, duration: 0.3, gain: 0.11 },
      ])
  }
}

/** Vibración corta en móviles; se ignora en escritorio. */
export const vibrar = (patron: number | number[] = [18, 40, 18]) => {
  try {
    navigator.vibrate?.(patron)
  } catch {
    // No soportado
  }
}
