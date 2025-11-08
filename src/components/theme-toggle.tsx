import { Moon, SunMedium } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/theme-provider'

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema"
      onClick={toggleTheme}
      className="rounded-full border border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-900"
    >
      {theme === 'dark' ? (
        <SunMedium className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  )
}
