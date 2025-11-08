import defaultTheme from 'tailwindcss/defaultTheme'
import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f7ff',
          100: '#e4edff',
          200: '#c3d6ff',
          300: '#99b5ff',
          400: '#6287ff',
          500: '#3b5bff',
          600: '#2f46db',
          700: '#2536b0',
          800: '#1f2f8c',
          900: '#1d2b72',
        },
        slate: {
          950: '#0f1729',
        },
      },
      fontFamily: {
        sans: ['"Inter Tight"', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
      boxShadow: {
        focus: '0 0 0 3px rgba(59, 91, 255, 0.35)',
      },
      keyframes: {
        'fade-slide-up': {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-slide-up': 'fade-slide-up 220ms ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
