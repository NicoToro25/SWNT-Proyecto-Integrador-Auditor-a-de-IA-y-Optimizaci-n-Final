import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizar({
      open: true,
      output: "visualizer-stats.html",
      gzipSize: true,
      brotliSize: true,
    })
  ],
})
