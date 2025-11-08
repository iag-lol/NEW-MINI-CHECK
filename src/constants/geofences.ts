export type TerminalSlug = 'El Roble' | 'La Reina' | 'María Angélica' | 'El Descanso'

export interface Geofence {
  name: TerminalSlug
  lat: number
  lon: number
  radius: number
}

export const TERMINAL_GEOFENCES: Geofence[] = [
  { name: 'El Roble', lat: -33.44084737259636, lon: -70.78973311321552, radius: 420 },
  { name: 'La Reina', lat: -33.46507235045187, lon: -70.53199751122676, radius: 380 },
  { name: 'María Angélica', lat: -33.51782973902434, lon: -70.55644077440391, radius: 360 },
  { name: 'El Descanso', lat: -33.46956412140027, lon: -70.76228544799713, radius: 360 },
]
