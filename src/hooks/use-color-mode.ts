import { useContext } from 'react'
import { ThemeContext } from '@/providers/theme-context'

export const useColorMode = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useColorMode must be used inside ThemeProvider')
  return context
}
