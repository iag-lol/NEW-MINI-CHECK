import { TERMINAL_GEOFENCES, type Geofence } from '@/constants/geofences'

const EARTH_RADIUS_METERS = 6_371_000

const toRad = (value: number) => (value * Math.PI) / 180

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
}

export const detectTerminal = (lat: number, lon: number) => {
  const match = TERMINAL_GEOFENCES.map((fence) => ({
    fence,
    distance: haversineDistance(lat, lon, fence.lat, fence.lon),
  }))
    .sort((a, b) => a.distance - b.distance)
    .find((candidate) => candidate.distance <= candidate.fence.radius)

  if (!match) {
    return null
  }

  return {
    terminal: match.fence.name,
    distance: Math.round(match.distance),
  }
}

/** Distancia en metros entre dos coordenadas (para medir trayectorias) */
export const haversineMeters = haversineDistance

/**
 * Distancia (en metros) al terminal más cercano y si el punto
 * está dentro de su geocerca. Útil para medir la precisión de
 * una revisión respecto del terminal.
 */
export const closestTerminalDistance = (lat: number, lon: number) => {
  const best = TERMINAL_GEOFENCES.map((fence) => ({
    fence,
    distance: haversineDistance(lat, lon, fence.lat, fence.lon),
  })).sort((a, b) => a.distance - b.distance)[0]

  return {
    terminal: best.fence.name,
    distance: Math.round(best.distance),
    inside: best.distance <= best.fence.radius,
  }
}

export const getClosestTerminal = (lat: number, lon: number): Geofence =>
  TERMINAL_GEOFENCES.map((fence) => ({
    fence,
    distance: haversineDistance(lat, lon, fence.lat, fence.lon),
  })).sort((a, b) => a.distance - b.distance)[0]?.fence ?? TERMINAL_GEOFENCES[0]
