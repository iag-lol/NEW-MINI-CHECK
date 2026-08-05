/**
 * Utilidades de color para generar rampas de marca completas a partir de un
 * único color base.
 *
 * Antes las variantes se construían pegando alfa al hexadecimal
 * (`primaryLight + '40'`). Eso produce colores translúcidos: el mismo token se
 * ve distinto según lo que tenga debajo, y sobre las superficies de cristal de
 * esta app quedaba lavado e impredecible. Aquí se mezcla contra blanco o negro
 * para obtener colores sólidos y estables.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export const hexToRgb = (hex: string): RGB => {
  const limpio = hex.replace('#', '')
  const valor =
    limpio.length === 3
      ? limpio
          .split('')
          .map((c) => c + c)
          .join('')
      : limpio
  const entero = parseInt(valor.slice(0, 6), 16)
  return {
    r: (entero >> 16) & 255,
    g: (entero >> 8) & 255,
    b: entero & 255,
  }
}

export const rgbToHex = ({ r, g, b }: RGB) =>
  `#${[r, g, b]
    .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()

/** Mezcla dos colores. `t` = 0 devuelve `a`, `t` = 1 devuelve `b`. */
export const mixHex = (a: string, b: string, t: number) => {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  })
}

/** Luminancia relativa (WCAG), para decidir texto claro u oscuro encima. */
export const luminancia = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export const contraste = (a: string, b: string) => {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la]
  return (claro + 0.05) / (oscuro + 0.05)
}

/** Texto legible sobre un fondo dado. */
export const textoSobre = (fondo: string) =>
  contraste(fondo, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A'

export type RampaMarca = Record<
  50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950,
  string
>

/**
 * Genera los once escalones de marca desde el color 500.
 * Los tintes se mezclan con blanco y las sombras con un azul muy oscuro (no
 * negro puro): mantiene el matiz y evita que los tonos oscuros se vean sucios.
 */
export const construirRampa = (base: string): RampaMarca => {
  const NEGRO = '#0A0F1F'
  return {
    50: mixHex(base, '#FFFFFF', 0.94),
    100: mixHex(base, '#FFFFFF', 0.86),
    200: mixHex(base, '#FFFFFF', 0.72),
    300: mixHex(base, '#FFFFFF', 0.52),
    400: mixHex(base, '#FFFFFF', 0.26),
    500: base,
    600: mixHex(base, NEGRO, 0.18),
    700: mixHex(base, NEGRO, 0.34),
    800: mixHex(base, NEGRO, 0.5),
    900: mixHex(base, NEGRO, 0.66),
    950: mixHex(base, NEGRO, 0.8),
  }
}
