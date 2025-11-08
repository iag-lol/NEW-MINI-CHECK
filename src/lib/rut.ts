const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase()

export const formatRut = (rut: string) => {
  const cleaned = cleanRut(rut)
  if (!cleaned) return ''
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  const reversed = body.split('').reverse()
  const formatted = reversed
    .map((digit, index) => (index > 0 && index % 3 === 0 ? `${digit}.` : digit))
    .reverse()
    .join('')
  return `${formatted}-${dv}`
}

export const validateRut = (rut: string) => {
  const cleaned = cleanRut(rut)
  if (cleaned.length < 2) return false
  const body = cleaned.slice(0, -1)
  const dv = cleaned.slice(-1)
  let sum = 0
  let multiplier = 2
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += parseInt(body[i], 10) * multiplier
    multiplier = multiplier === 7 ? 2 : multiplier + 1
  }
  const expected = 11 - (sum % 11)
  const dvComputed =
    expected === 11 ? '0' : expected === 10 ? 'K' : String(expected)
  return dv === dvComputed
}

export const normalizeRut = (rut: string) => cleanRut(formatRut(rut))
