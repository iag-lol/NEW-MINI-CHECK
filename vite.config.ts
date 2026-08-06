import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Los console.* de diagnóstico no viajan a producción: revelan la forma de
  // las consultas y los mensajes de error internos a cualquiera que abra la
  // consola. Se conservan warn y error, que sí sirven para soporte.
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug', 'console.info'],
  },
  build: {
    // El navegador cachea por archivo. Con un único bundle, cambiar una línea
    // de la app obliga a volver a descargar React entero en cada despliegue.
    //
    // Se separa SÓLO el núcleo de React, y a propósito. Medido sobre este
    // proyecto: aislarlo cuesta unos 25 kB de más en la primera visita —los
    // límites entre trozos impiden algo de tree-shaking— y ahorra 327 kB en
    // cada despliegue posterior, porque ese trozo no cambia y se sirve de
    // caché. Separar además Supabase, Radix y framer-motion subía el coste
    // fijo a 70 kB sin ahorrar mucho más: no compensaba.
    //
    // Las librerías pesadas y diferidas (ExcelJS, jsPDF, Recharts, Leaflet)
    // quedan FUERA de esta lista por un motivo distinto: al forzarlas a un
    // trozo con nombre, Rollup deja de poder mantenerlas dentro del trozo
    // diferido que las pide y las promueve a dependencia estática del
    // arranque, con lo que se descargaban al abrir la app aunque nadie fuera
    // a exportar nada. Repartidas por Rollup se quedan donde deben: detrás
    // del botón que las necesita.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('@tanstack')
          ) {
            return 'vendor-react'
          }
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  publicDir: 'public',
})
