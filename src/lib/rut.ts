const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase()

const computeDV = (body: string) => {
  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += parseInt(body[i], 10) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const remainder = 11 - (sum % 11)
  if (remainder === 11) return '0'
  if (remainder === 10) return 'K'
  return String(remainder)
}

export const formatRut = (rut: string) => {
  const cleaned = cleanRut(rut)
  if (cleaned.length <= 1) return cleaned
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${formattedBody}-${dv}`
}

export const validateRut = (rut: string) => {
  const cleaned = cleanRut(rut)
  if (cleaned.length < 2) return false
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  return computeDV(body) === dv
}

export const normalizeRut = (rut: string) => cleanRut(rut)
