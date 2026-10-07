export type SimulationSound = 'ambient' | 'detection' | 'alert' | 'confirm' | 'completion'

export function playSimulationTone(kind: SimulationSound, volume = 0.35) {
  if (typeof window === 'undefined') return
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return
  const context = new AudioContextCtor()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const frequencies: Record<SimulationSound, number> = { ambient: 180, detection: 620, alert: 260, confirm: 440, completion: 740 }
  oscillator.type = kind === 'ambient' ? 'sine' : 'triangle'
  oscillator.frequency.value = frequencies[kind]
  gain.gain.setValueAtTime(Math.max(0.01, volume), context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (kind === 'ambient' ? 0.35 : 0.16))
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + (kind === 'ambient' ? 0.35 : 0.16))
  oscillator.addEventListener('ended', () => void context.close(), { once: true })
}

export const terrainAudio: Record<string, SimulationSound> = { 'High Altitude': 'ambient', Desert: 'ambient', Coastline: 'ambient', Urban: 'ambient', Rural: 'ambient', Highlands: 'ambient', Border: 'ambient' }
