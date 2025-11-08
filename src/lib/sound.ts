let ctx: AudioContext | null = null

const getAudioContext = () => {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

export const playNotificationTone = () => {
  const audioContext = getAudioContext()
  if (!audioContext) return
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.0, audioContext.currentTime)
  gain.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.2)
  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 1.25)
}
