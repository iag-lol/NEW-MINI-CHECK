import { AnimatePresence, motion } from 'framer-motion'
import { Moon, SunMedium } from 'lucide-react'
import { useColorMode } from '@/hooks/use-color-mode'

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useColorMode()
  const esNoche = theme === 'dark'

  return (
    <button
      type="button"
      aria-label={esNoche ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
      aria-pressed={esNoche}
      onClick={toggleTheme}
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-transparent text-slate-500 transition active:scale-95 hover:border-white/60 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10 sm:h-10 sm:w-10"
    >
      {/* El icono gira al entrar y salir: el cambio de modo se siente
          instantáneo aunque el repintado del fondo tarde. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -70, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 70, scale: 0.6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {esNoche ? (
            <SunMedium className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
