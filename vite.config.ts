import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { preloPdfxPlugin } from './scripts/pdfx-vite-plugin.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloPdfxPlugin()],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'diagramador/**'],
  },
})
