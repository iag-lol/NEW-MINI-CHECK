/**
 * Obtiene la dirección IP pública del usuario
 * Usa múltiples servicios como fallback
 */
export async function getUserIP(): Promise<string | null> {
  const services = [
    'https://api.ipify.org?format=json',
    'https://api.my-ip.io/v2/ip.json',
    'https://ipapi.co/json/',
  ]

  for (const service of services) {
    try {
      const response = await fetch(service, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) continue

      const data = await response.json()

      // Diferentes servicios retornan en diferentes formatos
      const ip = data.ip || data.address || null

      if (ip && typeof ip === 'string') {
        return ip
      }
    } catch (error) {
      console.warn(`Failed to fetch IP from ${service}:`, error)
      continue
    }
  }

  // Si todos los servicios fallan, retornar null
  return null
}

/**
 * Obtiene información de geolocalización basada en IP
 */
export async function getIPGeoLocation(ip: string) {
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) return null

    const data = await response.json()

    return {
      city: data.city || null,
      region: data.region || null,
      country: data.country_name || null,
      isp: data.org || null,
    }
  } catch (error) {
    console.warn('Failed to fetch IP geolocation:', error)
    return null
  }
}
