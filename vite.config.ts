import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'public', // Ensure public directory is copied to dist
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Copy public files to root of dist
    copyPublicDir: true,
  },
});
