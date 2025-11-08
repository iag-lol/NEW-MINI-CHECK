import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
