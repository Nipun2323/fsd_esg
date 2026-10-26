import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // Relative asset URLs let the build be served from a subpath
  // (GitHub Pages project sites, embedded previews) as well as root.
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Charting is the bulk of the payload and changes far less often
    // than app code — give it its own long-lived cache entry.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory|decimal\.js)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router)/ },
          ],
        },
      },
    },
  },
}))
